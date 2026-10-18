import { useEffect, useRef } from 'react';
import { applyServerPlayQueue } from '@/features/playback/store/applyServerPlayQueue';
import { useOrbitStore } from '@/features/orbit';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { profileIdFromQueueRef } from '@/lib/media/trackServerScope';
import { getPlaybackServerId } from '@/features/playback/utils/playback/playbackServer';
import {
  getPlaybackIdleSinceMs,
  isIdleQueuePullSuspended,
  isQueuePushFailed,
  isQueueNaturallyEnded,
  isPlaybackIdleLongEnough,
  markPlaybackIdle,
} from '@/features/playback/store/queuePlaybackIdle';
import { hasPendingQueueSync } from '@/features/playback/store/queueSync';
import type { ConnectionStatus } from '@/lib/hooks/useConnectionStatus';
import { canAutoIdlePlayQueuePull } from '@/app/hooks/usePlayQueueSyncLedState';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

const IDLE_THRESHOLD_MS = 30_000;
const POLL_INTERVAL_MS = 10_000;

/** Background pull when paused/stopped long enough, reconciled by queue owner. */
export function useIdlePlayQueuePull(status: ConnectionStatus) {
  const orbitRole = useOrbitStore(s => s.role);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const queueItems = usePlayerStore(s => s.queueItems);
  const inFlightRef = useRef(false);
  const startupPullDoneRef = useRef(false);

  useEffect(() => {
    if (!isPlaying && getPlaybackIdleSinceMs() === 0) {
      markPlaybackIdle();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!canAutoIdlePlayQueuePull(status, orbitRole)) return;

    const pull = () => {
      if (inFlightRef.current) return;
      if (isIdleQueuePullSuspended()) return;
      if (isQueueNaturallyEnded()) return;
      const serverIds = [...new Set(queueItems.map(profileIdFromQueueRef).filter(Boolean))];
      if (serverIds.length === 0) {
        const playbackServerId = getPlaybackServerId();
        if (playbackServerId) serverIds.push(playbackServerId);
      }
      if (serverIds.length === 0) return;

      inFlightRef.current = true;
      void (async () => {
        for (const serverId of serverIds) {
          if (isQueuePushFailed(serverId) || hasPendingQueueSync(serverId)) continue;
          await applyServerPlayQueue(serverId, { mode: 'idle', preferServerPosition: true });
        }
      })()
        .finally(() => {
          inFlightRef.current = false;
        });
    };

    const tick = () => {
      if (!canAutoIdlePlayQueuePull(status, orbitRole)) return;
      if (isPlaying) return;
      if (!isPlaybackIdleLongEnough(IDLE_THRESHOLD_MS)) return;
      pull();
    };

    // Touch shell: an app swiped away never flushes its position, and in the car
    // Play comes right after launch, so take the server's position once at
    // startup instead of after the idle threshold.
    if (IS_MOBILE_SHELL && !startupPullDoneRef.current) {
      startupPullDoneRef.current = true;
      if (!isPlaying) pull();
    }

    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isPlaying, orbitRole, queueItems, status]);
}
