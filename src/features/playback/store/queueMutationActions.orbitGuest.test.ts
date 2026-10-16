import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerOrbitRuntime } from '@/store/orbitRuntime';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeTrack, seedQueue } from '@/test/helpers/factories';

const suggestTracks = vi.fn(async () => {});

registerOrbitRuntime({
  getSnapshot: () => ({ role: 'guest', phase: 'active', state: null, serverId: 'srv' }),
  bulkGuard: async () => true,
  allowsTrackServer: () => true,
  suggestTracks,
});

describe('queue additions of an Orbit guest (desktop)', () => {
  beforeEach(() => {
    resetAllStores();
    suggestTracks.mockClear();
    seedQueue([makeTrack({ id: 'host-1' })]);
  });

  it('stay in the local queue as they always have (no suggestions)', () => {
    usePlayerStore.getState().enqueue([makeTrack({ id: 'q1' })]);
    usePlayerStore.getState().enqueueAt([makeTrack({ id: 'n1' })], 1);
    expect(suggestTracks).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().queueItems.map(ref => ref.trackId)).toEqual(['host-1', 'n1', 'q1']);
  });
});
