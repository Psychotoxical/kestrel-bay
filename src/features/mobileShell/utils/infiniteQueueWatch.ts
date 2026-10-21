/**
 * Infinite queue on the phones: tops up whenever a song starts, however it started — a
 * tap on a song, next, a gapless change (the usual way on a phone), or switching the
 * infinite queue on. The shared playback code tops up only on `next`; a locked iPhone
 * sleeps by the time the queue would run dry, so waiting for the end is too late.
 * Mounted by both phone bridges (`ios/MobileIosBridge`, `android/MobileAndroidBridge`).
 */
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { topUpInfiniteQueueAhead } from '@/features/playback/store/infiniteQueueTopUp';
import { useAuthStore } from '@/store/authStore';

function topUpForCurrentSong(): void {
  const { currentTrack, currentRadio, queueIndex, queueItems } = usePlayerStore.getState();
  if (!currentTrack || currentRadio || !queueItems[queueIndex]) return;
  topUpInfiniteQueueAhead(usePlayerStore.setState, usePlayerStore.getState, queueIndex, currentTrack);
}

/** Returns the cleanup. */
export function watchInfiniteQueue(): () => void {
  const offPlayer = usePlayerStore.subscribe((state, prev) => {
    if (state.queueIndex !== prev.queueIndex || state.currentTrack?.id !== prev.currentTrack?.id) {
      topUpForCurrentSong();
    }
  });
  const offAuth = useAuthStore.subscribe((state, prev) => {
    if (state.infiniteQueueEnabled && !prev.infiniteQueueEnabled) topUpForCurrentSong();
  });
  topUpForCurrentSong();
  return () => {
    offPlayer();
    offAuth();
  };
}
