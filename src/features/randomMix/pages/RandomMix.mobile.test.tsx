import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeSubsonicSong } from '@/test/helpers/factories';
import { usePlayerStore } from '@/features/playback/store/playerStore';

const mocks = vi.hoisted(() => ({
  fetchRandomMixSongsUntilFull: vi.fn(),
  fetchGenreCatalog: vi.fn(),
}));

vi.mock('@/features/playback/utils/mixRatingFilter', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/playback/utils/mixRatingFilter')>()),
  fetchRandomMixSongsUntilFull: mocks.fetchRandomMixSongsUntilFull,
}));
vi.mock('@/features/playback/utils/playback/genreBrowsePlayback', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/playback/utils/playback/genreBrowsePlayback')>()),
  fetchGenreCatalog: mocks.fetchGenreCatalog,
}));

// Covers resolve through the native cache, which these tests do not run.
vi.mock('@/cover/TrackRowCoverThumb', () => ({ BrowseTrackRowCoverThumb: () => null }));

import RandomMix from './RandomMix';

const SONGS = [
  makeSubsonicSong({ id: 's1', title: 'Got So High', artist: 'The Pretty Reckless', albumId: 'a1', genre: 'Rock' }),
  makeSubsonicSong({ id: 's2', title: 'Dream Gone Bad', artist: 'Killer Be Killed', albumId: 'a2', genre: 'Metal' }),
];

describe('Random mix in the touch shell', () => {
  beforeEach(() => {
    resetAllStores();
    mocks.fetchRandomMixSongsUntilFull.mockReset().mockResolvedValue(SONGS);
    mocks.fetchGenreCatalog.mockReset().mockResolvedValue([
      { value: 'Rock', songCount: 10, albumCount: 2 },
      { value: 'Metal', songCount: 8, albumCount: 2 },
    ]);
  });

  it('reads as the album page: play and remix, genres as chips, touch song rows', async () => {
    renderWithProviders(<RandomMix />, { route: '/random/mix' });
    expect(screen.getByRole('heading', { name: 'Random Mix' })).toBeInTheDocument();
    expect(await screen.findByText('Got So High')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Play$/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Remix/ })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Metal' })).toBeInTheDocument();
    expect(screen.queryByText('Title', { selector: '.tracklist-header *' })).not.toBeInTheDocument();
  });

  it('a genre chip mixes that genre', async () => {
    renderWithProviders(<RandomMix />, { route: '/random/mix' });
    fireEvent.click(await screen.findByRole('button', { name: 'Metal' }));
    expect(mocks.fetchRandomMixSongsUntilFull).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ genre: 'Metal' }),
    );
    expect(screen.getByRole('button', { name: 'Metal' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('tapping a song plays the mix from there', async () => {
    const playTrack = vi.fn();
    usePlayerStore.setState({ playTrack });
    renderWithProviders(<RandomMix />, { route: '/random/mix' });
    fireEvent.click(await screen.findByText('Dream Gone Bad'));
    expect(playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's2' }),
      expect.arrayContaining([expect.objectContaining({ id: 's1' })]),
    );
  });

  it('"Filters" opens mix size and exclusions in a sheet', async () => {
    renderWithProviders(<RandomMix />, { route: '/random/mix' });
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }));
    const sheet = await screen.findByRole('dialog');
    expect(sheet).toHaveTextContent('150');
    expect(sheet).toHaveTextContent(/audiobooks/i);
  });
});
