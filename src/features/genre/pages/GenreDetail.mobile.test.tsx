import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router';
import { useAuthStore } from '@/store/authStore';
import { makeServer } from '@/test/helpers/factories';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';

const hoisted = vi.hoisted(() => ({
  useGenreAlbumBrowse: vi.fn(),
  fetchGenreTracksForPlayback: vi.fn(),
}));

vi.mock('@/features/album', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/album')>()),
  useGenreAlbumBrowse: hoisted.useGenreAlbumBrowse,
  AlbumCard: ({ album }: { album: { name: string } }) => <div>{album.name}</div>,
}));
vi.mock('@/features/playback/utils/playback/genreBrowsePlayback', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/playback/utils/playback/genreBrowsePlayback')>()),
  fetchGenreTracksForPlayback: hoisted.fetchGenreTracksForPlayback,
  fetchGenreAlbumCount: vi.fn(async () => 2),
}));
vi.mock('@/ui/VirtualCardGrid', () => ({
  VirtualCardGrid: ({ items, renderItem }: {
    items: Array<{ id: string }>;
    renderItem: (item: { id: string }, index: number) => React.ReactNode;
  }) => <div>{items.map((item, i) => <div key={item.id}>{renderItem(item, i)}</div>)}</div>,
}));

import GenreDetail from './GenreDetail';

const ALBUMS = [{ id: 'a1', name: 'Hagel' }, { id: 'a2', name: 'Sturmwarnung' }];

function renderGenre() {
  return renderWithProviders(
    <Routes>
      <Route path="/genres/:name" element={<GenreDetail />} />
    </Routes>,
    { route: '/genres/Metal' },
  );
}

describe('Genre page in the touch shell', () => {
  beforeEach(() => {
    resetAuthStore();
    const server = makeServer({ id: 's1' });
    useAuthStore.setState({ servers: [server], activeServerId: server.id });
    hoisted.fetchGenreTracksForPlayback.mockReset().mockResolvedValue([]);
    hoisted.useGenreAlbumBrowse.mockReturnValue({
      albums: ALBUMS,
      displayAlbums: ALBUMS,
      loading: false,
      loadingMore: false,
      hasMore: false,
      loadMore: vi.fn(),
      bindLoadMoreSentinel: vi.fn(),
    });
  });

  it('has one back button, a large title with the count and the big play and shuffle buttons', () => {
    renderGenre();
    expect(screen.getByRole('heading', { name: 'Metal' })).toBeInTheDocument();
    expect(screen.getByText('2 albums')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Library/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Play$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Shuffle/ })).toBeInTheDocument();
    expect(screen.getByText('Hagel')).toBeInTheDocument();
  });

  it('shuffle plays the genre shuffled', async () => {
    renderGenre();
    fireEvent.click(screen.getByRole('button', { name: /Shuffle/ }));
    await waitFor(() => expect(hoisted.fetchGenreTracksForPlayback).toHaveBeenCalledWith(
      's1', 'Metal', expect.objectContaining({ shuffle: true }),
    ));
  });

  it('adding the genre to the queue sits in the "…" menu', async () => {
    renderGenre();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Add to queue' }));
    await waitFor(() => expect(hoisted.fetchGenreTracksForPlayback).toHaveBeenCalledWith(
      's1', 'Metal', expect.objectContaining({ shuffle: false }),
    ));
  });
});
