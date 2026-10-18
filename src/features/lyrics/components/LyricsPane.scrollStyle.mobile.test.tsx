import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UseLyricsResult } from '@/features/lyrics/hooks/useLyrics';
import type { Track } from '@/lib/media/trackTypes';
import { useAuthStore } from '@/store/authStore';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';

const lyricsResult = vi.hoisted(() => ({ current: null as UseLyricsResult | null }));

vi.mock('@/features/lyrics/hooks/useLyrics', () => ({
  useLyrics: () => lyricsResult.current,
}));

// Five seconds in: the second synced line is active from the first tick.
vi.mock('@/features/playback', async importActual => ({
  ...(await importActual<typeof import('@/features/playback')>()),
  getSmoothPlaybackTime: () => 5,
  subscribeSmoothPlaybackTime: () => () => {},
}));

vi.mock('@/lib/dom/easeScroll', async importActual => {
  const actual = await importActual<typeof import('@/lib/dom/easeScroll')>();
  return { ...actual, targetForFraction: vi.fn(actual.targetForFraction) };
});

import { targetForFraction } from '@/lib/dom/easeScroll';
import LyricsPane from './LyricsPane';

const track: Track = {
  id: 'song-1',
  title: 'Song',
  artist: 'Artist',
  album: 'Album',
  albumId: 'album-1',
  duration: 180,
};

beforeEach(() => {
  resetAuthStore();
  vi.mocked(targetForFraction).mockClear();
  useAuthStore.setState({
    lyricsSources: [{ id: 'server', enabled: true }],
    sidebarLyricsStyle: 'apple',
  });
  lyricsResult.current = {
    syncedLines: [{ time: 0, text: 'first line' }, { time: 3, text: 'second line' }],
    wordLines: null,
    plainLyrics: null,
    pronunciationLines: null,
    pronunciationPlainLyrics: null,
    translations: [],
    source: 'server',
    loading: false,
    notFound: false,
    refresh: () => {},
  };
});

describe('LyricsPane scroll style (touch shell)', () => {
  it('centres the active line even when a desktop backup chose the Apple Music-like style', () => {
    renderWithProviders(<LyricsPane currentTrack={track} />);

    expect(targetForFraction).toHaveBeenCalledWith(expect.anything(), expect.anything(), 0.5);
  });
});
