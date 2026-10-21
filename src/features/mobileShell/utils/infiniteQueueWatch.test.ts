import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ build: vi.fn() }));
vi.mock('@/features/playback/utils/playback/buildInfiniteQueueCandidates', () => ({
  buildInfiniteQueueCandidates: mocks.build,
}));

import { act } from '@testing-library/react';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import type { QueueItemRef, Track } from '@/lib/media/trackTypes';
import { _resetInfiniteQueueStateForTest } from '@/features/playback/store/infiniteQueueState';
import { resetAllStores } from '@/test/helpers/storeReset';
import { watchInfiniteQueue } from './infiniteQueueWatch';

const ref = (trackId: string, autoAdded = false): QueueItemRef => ({ serverId: 's1', trackId, ...(autoAdded ? { autoAdded } : {}) });
const track = (id: string): Track => ({ id, title: id, artist: 'Satyricon', album: 'A', albumId: 'a', duration: 200, serverId: 's1' });
const fresh = ['n1', 'n2', 'n3', 'n4', 'n5'].map(id => ({ ...track(id), autoAdded: true as const }));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const ids = () => usePlayerStore.getState().queueItems.map(r => r.trackId);

describe('watchInfiniteQueue', () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    resetAllStores();
    _resetInfiniteQueueStateForTest();
    mocks.build.mockReset().mockResolvedValue(fresh);
    useAuthStore.setState({ infiniteQueueEnabled: true });
    // A song tapped near the end of an album: one more to go, nothing auto-added yet.
    usePlayerStore.setState({
      currentTrack: track('last-man'),
      queueItems: [ref('last-man'), ref('den-siste')],
      queueIndex: 0,
      repeatMode: 'off',
      currentRadio: null,
    });
  });

  afterEach(() => { stop?.(); stop = undefined; });

  it('tops up for the song that is already playing', async () => {
    stop = watchInfiniteQueue();
    await act(flush);
    expect(mocks.build).toHaveBeenCalledTimes(1);
    expect(ids()).toEqual(['last-man', 'den-siste', 'n1', 'n2', 'n3', 'n4', 'n5']);
  });

  it('tops up again when a later song starts with two or fewer auto-added left', async () => {
    usePlayerStore.setState({ queueItems: [ref('a'), ref('b'), ref('x', true), ref('y', true), ref('z', true)] });
    stop = watchInfiniteQueue();
    await act(flush);
    expect(mocks.build).not.toHaveBeenCalled();
    act(() => { usePlayerStore.setState({ queueIndex: 2, currentTrack: track('x') }); });
    await act(flush);
    expect(mocks.build).toHaveBeenCalledTimes(1);
    expect(mocks.build.mock.calls[0][0].id).toBe('x');
  });

  it('tops up when the infinite queue is switched on, and not while it is off', async () => {
    useAuthStore.setState({ infiniteQueueEnabled: false });
    stop = watchInfiniteQueue();
    await act(flush);
    expect(mocks.build).not.toHaveBeenCalled();
    act(() => { useAuthStore.setState({ infiniteQueueEnabled: true }); });
    await act(flush);
    expect(mocks.build).toHaveBeenCalledTimes(1);
  });
});
