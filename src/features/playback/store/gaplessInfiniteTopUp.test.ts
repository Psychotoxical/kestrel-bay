import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ mobile: true, build: vi.fn() }));

vi.mock('@/lib/util/platform', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/util/platform')>()),
  get IS_MOBILE_SHELL() { return mocks.mobile; },
}));
vi.mock('@/features/playback/utils/playback/buildInfiniteQueueCandidates', () => ({
  buildInfiniteQueueCandidates: mocks.build,
}));

import { onInvoke } from '@/test/mocks/tauri';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import type { QueueItemRef, Track } from '@/lib/media/trackTypes';
import { _resetQueueResolverForTest, seedQueueResolver } from '@/features/playback/store/queueTrackResolver';
import { _resetPlaybackProgressForTest } from '@/features/playback/store/playbackProgress';
import { _resetInfiniteQueueStateForTest } from '@/features/playback/store/infiniteQueueState';
import { applyGaplessQueueAdvance } from '@/features/playback/store/gaplessQueueAdvance';

const ref = (trackId: string): QueueItemRef => ({ serverId: 's1', trackId });
const track = (id: string, extra: Partial<Track> = {}): Track => ({
  id, title: `Track ${id}`, artist: 'Artist', album: 'Album', albumId: 'alb-1', duration: 200, ...extra,
});
const fresh = ['n1', 'n2', 'n3', 'n4', 'n5'].map(id => track(id, { autoAdded: true }));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('infinite queue on a gapless song change', () => {
  beforeEach(() => {
    mocks.mobile = true;
    mocks.build.mockReset().mockResolvedValue(fresh);
    _resetQueueResolverForTest();
    _resetPlaybackProgressForTest();
    _resetInfiniteQueueStateForTest();
    onInvoke('audio_update_replay_gain', () => undefined);
    useAuthStore.setState({ gaplessEnabled: true, infiniteQueueEnabled: true });
    seedQueueResolver('s1', [track('t1'), track('t2')]);
    usePlayerStore.setState({
      currentTrack: track('t1'),
      queueItems: [ref('t1'), ref('t2')],
      queueIndex: 0,
      repeatMode: 'off',
      isPlaying: true,
      currentRadio: null,
    });
  });

  it('touch shell: tops up when the last songs start, so the queue never runs dry', async () => {
    expect(applyGaplessQueueAdvance({ source: 'track-switched' }).advanced).toBe(true);
    await flush();
    expect(mocks.build).toHaveBeenCalledTimes(1);
    expect(mocks.build.mock.calls[0][0].id).toBe('t2');
    expect(usePlayerStore.getState().queueItems.map(r => r.trackId)).toEqual(['t1', 't2', 'n1', 'n2', 'n3', 'n4', 'n5']);
  });

  it('does nothing with the infinite queue off', async () => {
    useAuthStore.setState({ infiniteQueueEnabled: false });
    applyGaplessQueueAdvance({ source: 'track-switched' });
    await flush();
    expect(mocks.build).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().queueItems).toHaveLength(2);
  });

  it('desktop: the gapless advance leaves the top-up to next(), as before', async () => {
    mocks.mobile = false;
    applyGaplessQueueAdvance({ source: 'track-switched' });
    await flush();
    expect(mocks.build).not.toHaveBeenCalled();
  });
});
