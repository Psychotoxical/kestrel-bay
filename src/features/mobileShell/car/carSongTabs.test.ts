import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { resetAllStores } from '@/test/helpers/storeReset';
import { CAR_SONG_TABS, watchCarSongTabs } from './carplayContent';

const song = (id: string, genre?: string) => ({ id, title: id, artist: 'A', album: 'B', albumId: 'b', duration: 1, genre }) as never;

describe('watchCarSongTabs', () => {
  let refresh: ReturnType<typeof vi.fn<(nodes: string[]) => void>>;
  let stop: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    resetAllStores();
    refresh = vi.fn<(nodes: string[]) => void>();
    stop = watchCarSongTabs(refresh);
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('refreshes the Start and mix tabs once after the song changes', () => {
    usePlayerStore.setState({ currentTrack: song('1', 'Rock') });
    usePlayerStore.setState({ currentTrack: song('2', 'Rock') });
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith(CAR_SONG_TABS);
  });

  it('ignores updates that leave the song as it is', () => {
    usePlayerStore.setState({ progress: 0.5, isPlaying: true });
    vi.advanceTimersByTime(2000);
    expect(refresh).not.toHaveBeenCalled();
  });
});
