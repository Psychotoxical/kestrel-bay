import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { usePlayerStore } from '@/features/playback';
import { reopenAudioOutput } from '@/features/mobileShell/utils/reopenAudioOutput';
import { RADIO_STARTING_EVENT } from '@/features/playback/store/radioPlayer';

/** How long after a station starts an interruption is its own audio taking over (seen: 2 s). */
const RADIO_TAKEOVER_MS = 5000;

interface InterruptionPayload {
  began: boolean;
  shouldResume: boolean;
}

/**
 * iOS: a call, Siri or an alarm interrupts the audio session, and unplugged
 * headphones or a lost Bluetooth device drop its route. iOS stops the output but
 * not the player, so the native side (`src-tauri/src/ios/audio_session.rs`) reports both. The
 * player pauses with them; when the interruption ends the output is reopened and
 * the player resumes what was playing before, only when iOS allows it
 * (`shouldResume`), like Apple Music. A lost route pauses for good. If iOS never
 * reports the end, coming back to the app reopens the output without playing.
 */
export function useIosAudioInterruptions(): void {
  useEffect(() => {
    let cancelled = false;
    let interrupted = false;
    let resumeAfterInterruption = false;
    const unlisten: Array<() => void> = [];

    // A station plays through the page's own audio, which takes the audio session over from
    // the engine: iOS reports that as an interruption, and pausing then left the player
    // showing "paused" while the radio played (car test 21.10.).
    let radioStartedAt = -Infinity;
    const onRadioStarting = () => { radioStartedAt = performance.now(); };
    window.addEventListener(RADIO_STARTING_EVENT, onRadioStarting);

    const pauseIfPlaying = () => {
      const player = usePlayerStore.getState();
      if (player.isPlaying) player.pause();
    };

    const recover = async (resume: boolean) => {
      if (interrupted) {
        interrupted = false;
        await reopenAudioOutput();
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
          if (performance.now() - radioStartedAt < RADIO_TAKEOVER_MS) return;
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
    };
    void setup();

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(RADIO_STARTING_EVENT, onRadioStarting);
      unlisten.forEach(off => off());
    };
  }, []);
}
