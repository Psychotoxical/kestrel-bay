import { buildInfiniteQueueCandidates } from '@/features/playback/utils/playback/buildInfiniteQueueCandidates';
import {
  ensureQueueServerPinned,
  playbackProfileIdForTrack,
} from '@/features/playback/utils/playback/playbackServer';
import { useAuthStore } from '@/store/authStore';
import { getPlayGeneration } from '@/features/playback/store/engineState';
import {
  isInfiniteQueueFetching,
  setInfiniteQueueFetching,
} from '@/features/playback/store/infiniteQueueState';
import { isInOrbitSession } from '@/store/orbitRuntime';
import type { Track } from '@/lib/media/trackTypes';
import type { PlayerState } from '@/features/playback/store/playerStoreTypes';
import { toQueueItemRefs } from '@/features/playback/store/queueItemRef';
import { seedQueueResolver } from '@/features/playback/store/queueTrackResolver';
import { queueItemIdentityKey } from '@/features/playback/utils/playback/queueIdentity';

type SetState = (
  partial: Partial<PlayerState> | ((state: PlayerState) => Partial<PlayerState>),
) => void;
type GetState = () => PlayerState;

/**
 * Infinite queue: when the song at `playingIdx` has started and ≤ 2 auto-added songs
 * remain after it, append 5 more, so the queue never runs dry without a visible loading
 * pause. Called by `next` and, in the touch shell, by the gapless advance too.
 *
 * Skipped while in Orbit — the host's queue is the source of truth there, and any silent
 * local extension would either drift this client off the host or pop the bulk-add modal
 * at the next track-end fallback.
 */
export function topUpInfiniteQueueAhead(
  set: SetState,
  get: GetState,
  playingIdx: number,
  playingTrack: Track,
): void {
  const { queueItems, repeatMode } = get();
  const { infiniteQueueEnabled } = useAuthStore.getState();
  if (!infiniteQueueEnabled || repeatMode !== 'off' || isInfiniteQueueFetching() || isInOrbitSession()) return;
  const remainingAuto = queueItems.slice(playingIdx + 1).filter(r => r.autoAdded).length;
  if (remainingAuto > 2) return;
  const topUpGeneration = getPlayGeneration();
  const topUpServerId = playbackProfileIdForTrack(playingTrack, queueItems[playingIdx]);
  setInfiniteQueueFetching(true);
  const existingIdentities = new Set(queueItems.map(queueItemIdentityKey));
  buildInfiniteQueueCandidates(playingTrack, topUpServerId, existingIdentities, 5).then(newTracks => {
    // Re-check at resolution time — the user may have joined
    // an Orbit session between scheduling and resolving.
    if (isInOrbitSession() || getPlayGeneration() !== topUpGeneration) return;
    if (newTracks.length > 0) {
      // Pin before set so the appended refs carry the canonical server
      // key; without this the auto-added rows render as '…' / 0:00
      // when the queue was populated without a queue-replacing playTrack
      // (see PR #892).
      ensureQueueServerPinned(newTracks);
      set(state => {
        if (topUpServerId) seedQueueResolver(topUpServerId, newTracks);
        const newItems = [...state.queueItems, ...toQueueItemRefs(topUpServerId, newTracks)];
        return { queueItems: newItems };
      });
    }
  }).catch(() => {}).finally(() => { setInfiniteQueueFetching(false); });
}
