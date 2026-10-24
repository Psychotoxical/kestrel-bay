import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { useAuthStore } from '@/store/authStore';
import { makeServer, makeSubsonicSong } from '@/test/helpers/factories';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';

const hoisted = vi.hoisted(() => ({ useMoodAlbumBrowse: vi.fn(), useMoodTrackBrowse: vi.fn() }));

vi.mock('../hooks/useMoodAlbumBrowse', () => ({ useMoodAlbumBrowse: hoisted.useMoodAlbumBrowse }));
vi.mock('../hooks/useMoodTrackBrowse', () => ({ useMoodTrackBrowse: hoisted.useMoodTrackBrowse }));
// The cover loads through the cover cache, which the test does not set up.
vi.mock('@/cover/CoverArtImage', () => ({ CoverArtImage: () => null }));
vi.mock('@/lib/library/moodAlbumBrowse', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/library/moodAlbumBrowse')>()),
  fetchMoodAlbumTotal: vi.fn(async () => null),
}));
vi.mock('@/ui/VirtualCardGrid', () => ({
  VirtualCardGrid: ({ items, renderItem }: {
    items: Array<{ id: string }>;
    renderItem: (item: { id: string }, index: number) => React.ReactNode;
  }) => <div>{items.map((item, i) => <div key={item.id}>{renderItem(item, i)}</div>)}</div>,
}));
vi.mock('@/features/album', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/album')>()),
  AlbumCard: ({ album }: { album: { name: string } }) => <div>{album.name}</div>,
}));

import MoodDetail from './MoodDetail';

describe('Mood page in the touch shell', () => {
  beforeEach(() => {
    resetAuthStore();
    const server = makeServer({ id: 's1' });
    useAuthStore.setState({ servers: [server], activeServerId: server.id });
    const albums = [{ id: 'a1', name: 'Midnight Signals' }];
    hoisted.useMoodAlbumBrowse.mockReturnValue({
      albums,
      displayAlbums: albums,
      loading: false,
      loadingMore: false,
      hasMore: false,
      loadMore: vi.fn(),
      bindLoadMoreSentinel: vi.fn(),
    });
    hoisted.useMoodTrackBrowse.mockReturnValue({
      songs: [],
      total: null,
      loading: false,
      sessionReady: true,
      loadingMore: false,
      hasMore: false,
      loadMore: vi.fn(),
    });
  });

  it('shows the tracks as touch rows under the Albums / Tracks switch', () => {
    hoisted.useMoodTrackBrowse.mockReturnValue({
      ...hoisted.useMoodTrackBrowse(),
      songs: [makeSubsonicSong({ id: 't1', title: 'Glass Harbour', artist: 'Night Ferry', albumId: 'a1' })],
      total: 1,
    });
    renderWithProviders(
      <Routes><Route path="/moods/:name" element={<MoodDetail />} /></Routes>,
      { route: '/moods/Atmospheric?view=tracks' },
    );
    expect(screen.getByRole('tab', { name: 'Tracks' })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('.mobile-page-subtitle')?.textContent).toContain('1 track');
    expect(screen.getByText('Glass Harbour')).toBeInTheDocument();
    expect(screen.getByText('Night Ferry')).toBeInTheDocument();
    expect(screen.queryByRole('columnheader')).not.toBeInTheDocument();
    expect(document.querySelector('.mobile-track')).not.toBeNull();
  });

  it('leaves going back to the shell and shows title and count', () => {
    renderWithProviders(
      <Routes><Route path="/moods/:name" element={<MoodDetail />} /></Routes>,
      { route: '/moods/Atmospheric' },
    );
    expect(screen.getByRole('heading', { name: 'Atmospheric' })).toBeInTheDocument();
    expect(screen.getByText('1 album')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByText('Midnight Signals')).toBeInTheDocument();
  });
});
