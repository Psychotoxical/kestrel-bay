import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { usePlayerStore } from '@/features/playback';

interface InterruptionPayload {
  began: boolean;
  shouldResume: boolean;
}

/**
 * iOS: a call, Siri or an alarm interrupts the audio session, and unplugged
 * headphones or a lost Bluetooth device drop its route. iOS stops the output but
 * not the player, so the native side (`ios_audio_session.rs`) reports both and
 * the player pauses with them. After an interruption it resumes only what was
 * playing before, and only when iOS allows it (`shouldResume`), like Apple Music.
 * A lost route pauses for good.
 */
export function useIosAudioInterruptions(): void {
  useEffect(() => {
    let cancelled = false;
    let resumeAfterInterruption = false;
    const unlisten: Array<() => void> = [];

    const pauseIfPlaying = () => {
      const player = usePlayerStore.getState();
      if (player.isPlaying) player.pause();
    };

    const setup = async () => {
      const offInterruption = await listen<InterruptionPayload>('ios-audio:interruption', ({ payload }) => {
        if (payload.began) {
          resumeAfterInterruption = usePlayerStore.getState().isPlaying;
          pauseIfPlaying();
          return;
        }
        if (resumeAfterInterruption && payload.shouldResume) usePlayerStore.getState().resume();
        resumeAfterInterruption = false;
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
      unlisten.forEach(off => off());
    };
  }, []);
}
