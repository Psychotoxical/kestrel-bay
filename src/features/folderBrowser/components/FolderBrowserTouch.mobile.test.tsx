import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { Route, Routes, useNavigate } from 'react-router';
import { useAuthStore } from '@/store/authStore';
import { makeServer } from '@/test/helpers/factories';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';

const reads = vi.hoisted(() => ({
  libraryScopeListArtists: vi.fn(),
  libraryScopeArtistDetail: vi.fn(),
  libraryScopeAlbumDetail: vi.fn(),
}));
vi.mock('@/lib/api/library/scopeReads', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api/library/scopeReads')>()),
  ...reads,
}));
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; getItemKey: (index: number) => string }) => ({
    getVirtualItems: () => Array.from({ length: opts.count }, (_, index) => ({
      index, key: opts.getItemKey(index), start: index * 56, size: 56,
    })),
    getTotalSize: () => opts.count * 56,
    measureElement: () => {},
    options: { scrollMargin: 0 },
  }),
}));

import FolderBrowserTouch from './FolderBrowserTouch';

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>test-back</button>;
}

describe('Folder browser in the touch shell', () => {
  beforeEach(() => {
    resetAuthStore();
    const server = makeServer({ id: 's1', name: 'Home' });
    useAuthStore.setState({
      servers: [server],
      activeServerId: server.id,
      musicFoldersByServer: { s1: [{ id: 'm1', name: 'Music' }] },
    });
    reads.libraryScopeListArtists.mockResolvedValue([{ id: 'ar1', serverId: 's1', name: 'Night Ferry' }]);
    reads.libraryScopeArtistDetail.mockResolvedValue({
      albums: [{ id: 'al1', serverId: 's1', name: 'Glass Harbour', artist: 'Night Ferry', artistId: 'ar1' }],
      appearsOnAlbums: [],
    });
  });

  it('opens one level per screen and steps back through history', async () => {
    renderWithProviders(
      <><BackButton /><Routes><Route path="/folders" element={<FolderBrowserTouch />} /></Routes></>,
      { route: '/folders' },
    );
    expect(screen.getByRole('heading', { name: 'Folder Browser' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Home - Music/ }));

    expect(await screen.findByRole('heading', { name: 'Home - Music' })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /Night Ferry/ }));

    expect(await screen.findByRole('heading', { name: 'Night Ferry' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Glass Harbour/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Home - Music/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'test-back' }));
    expect(await screen.findByRole('heading', { name: 'Home - Music' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Night Ferry/ })).toBeInTheDocument();
  });
});
