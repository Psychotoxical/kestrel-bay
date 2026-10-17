import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { OPEN_SEARCH_EVENT } from '@/lib/dom/openSearch';
import TracksPageChrome from '@/features/search/components/TracksPageChrome';

const mocks = vi.hoisted(() => ({
  getRandomSongs: vi.fn(),
  ndListSongs: vi.fn(),
  playSongNow: vi.fn(),
  navigateToAlbum: vi.fn(),
}));

vi.mock('@/lib/api/subsonicLibrary', () => ({ getRandomSongs: mocks.getRandomSongs }));
vi.mock('@/lib/api/navidromeBrowse', () => ({ ndListSongs: mocks.ndListSongs }));
vi.mock('@/features/playback/utils/playback/playSong', () => ({ playSongNow: mocks.playSongNow }));
vi.mock('@/store/authStore', () => ({
  useAuthStore: (selector: (state: { activeServerId: string }) => unknown) => selector({ activeServerId: 'server-1' }),
}));
vi.mock('@/features/playback/store/playerStore', () => ({
  usePlayerStore: (selector: (state: { enqueue: () => void }) => unknown) => selector({ enqueue: vi.fn() }),
}));
vi.mock('@/features/album', () => ({ useNavigateToAlbum: () => mocks.navigateToAlbum }));
vi.mock('@/features/artist', () => ({ useNavigateToArtist: () => vi.fn() }));
vi.mock('@/cover/AlbumCoverArtImage', () => ({ AlbumCoverArtImage: () => null }));
vi.mock('@/features/home', async () => {
  const React = await import('react');
  return {
    SongRail: ({ title }: { title: string }) => React.createElement('h2', null, title),
  };
});

const HERO = {
  id: 's1', title: 'Man muss nicht sterben', artist: 'Hämatom', album: 'Schutt und Asche',
  albumId: 'al1', coverArt: 'al1', duration: 200,
} as SubsonicSong;

describe('Tracks in the touch shell', () => {
  beforeEach(() => {
    mocks.getRandomSongs.mockReset().mockImplementation(async (n: number) => (n === 1 ? [HERO] : []));
    mocks.ndListSongs.mockReset().mockResolvedValue([{ ...HERO, id: 's2', userRating: 5 }]);
    mocks.playSongNow.mockReset();
    mocks.navigateToAlbum.mockReset();
  });

  it('is a discovery page: title, search, track of the moment, the two rails', async () => {
    renderWithProviders(<TracksPageChrome />);
    expect(screen.getByRole('heading', { name: 'Tracks' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Man muss nicht sterben' })).toBeInTheDocument();
    expect(screen.getByText('Track of the moment')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Highly Rated' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Random Pick' })).toBeInTheDocument();
  });

  it('plays the track of the moment, and opens its album from the card', async () => {
    renderWithProviders(<TracksPageChrome />);
    await screen.findByRole('heading', { name: 'Man muss nicht sterben' });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(mocks.playSongNow).toHaveBeenCalledWith(HERO);
    expect(mocks.navigateToAlbum).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('banner', { name: 'Track of the moment' }));
    expect(mocks.navigateToAlbum).toHaveBeenCalledWith('al1', { serverId: 'server-1' });
  });

  it('the search field opens the search', () => {
    const onOpen = vi.fn();
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    renderWithProviders(<TracksPageChrome />);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('shows no discovery while offline', () => {
    renderWithProviders(<TracksPageChrome hideDiscoveryChrome />);
    expect(screen.queryByText('Track of the moment')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Random Pick' })).not.toBeInTheDocument();
  });
});
