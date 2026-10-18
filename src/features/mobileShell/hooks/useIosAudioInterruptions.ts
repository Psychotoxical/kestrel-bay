import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { usePlayerStore } from '@/features/playback';
import { audioSetDevice } from '@/lib/api/audio';
import { useAuthStore } from '@/store/authStore';

interface InterruptionPayload {
  began: boolean;
  shouldResume: boolean;
}

/** Longest wait for the engine's `audio:device-changed` after reopening. */
const REOPEN_SETTLE_MS = 2000;

/**
 * After an interruption iOS has stopped the app's audio output, and the engine
 * keeps writing into it: nothing plays until the app restarts. Reopen the output
 * the way an output-device switch does (`audio_set_device` with the current
 * device), and wait until the device bridge has handled the engine's
 * `audio:device-changed`, so a resume afterwards starts cleanly on the new output.
 */
async function reopenOutput(): Promise<void> {
  let settled!: () => void;
  const changed = new Promise<void>(resolve => { settled = resolve; });
  const off = await listen('audio:device-changed', () => settled());
  const timer = window.setTimeout(() => settled(), REOPEN_SETTLE_MS);
  try {
    await audioSetDevice({ deviceName: useAuthStore.getState().audioOutputDevice ?? null });
    await changed;
  } catch {
    // Reopen failed: the engine keeps its previous state; nothing more to do here.
  } finally {
    window.clearTimeout(timer);
    off();
  }
}

/**
 * iOS: a call, Siri or an alarm interrupts the audio session, and unplugged
 * headphones or a lost Bluetooth device drop its route. iOS stops the output but
 * not the player, so the native side (`ios_audio_session.rs`) reports both. The
 * player pauses with them; when the interruption ends the output is reopened and
 * the player resumes what was playing before, only when iOS allows it
 * (`shouldResume`), like Apple Music. A lost route pauses for good. If iOS never
 * reports the end, coming back to the app reopens the output without playing.
 * A new route (CarPlay plugged in, headphones connected) can leave the output
 * stalled on the old one, so it is reopened right away; playback carries on.
 */
export function useIosAudioInterruptions(): void {
  useEffect(() => {
    let cancelled = false;
    let interrupted = false;
    let resumeAfterInterruption = false;
    const unlisten: Array<() => void> = [];

    const pauseIfPlaying = () => {
      const player = usePlayerStore.getState();
      if (player.isPlaying) player.pause();
    };

    const recover = async (resume: boolean) => {
      if (interrupted) {
        interrupted = false;
        await reopenOutput();
      }
      if (resume && !cancelled) usePlayerStore.getState().resume();
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible' && interrupted) {
        resumeAfterInterruption = false;
        void recover(false);
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    const setup = async () => {
      const offInterruption = await listen<InterruptionPayload>('ios-audio:interruption', ({ payload }) => {
        if (payload.began) {
          interrupted = true;
          resumeAfterInterruption = usePlayerStore.getState().isPlaying;
          pauseIfPlaying();
          return;
        }
        const resume = resumeAfterInterruption && payload.shouldResume;
        resumeAfterInterruption = false;
        void recover(resume);
      });
      if (cancelled) { offInterruption(); return; }
      unlisten.push(offInterruption);

      const offRouteLost = await listen('ios-audio:route-lost', () => {
        resumeAfterInterruption = false;
        pauseIfPlaying();
      });
      if (cancelled) { offRouteLost(); return; }
      unlisten.push(offRouteLost);

      const offRouteNew = await listen('ios-audio:route-new', () => {
        void reopenOutput();
      });
      if (cancelled) { offRouteNew(); return; }
      unlisten.push(offRouteNew);
    };
    void setup();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      unlisten.forEach(off => off());
    };
  }, []);
}
