import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';

const mocks = vi.hoisted(() => ({ fetchMostPlayedAlbums: vi.fn() }));

vi.mock('@/lib/api/subsonicStatistics', () => ({ fetchMostPlayedAlbums: mocks.fetchMostPlayedAlbums }));
vi.mock('@/cover/useLibraryCoverRef', () => ({ useAlbumCoverRef: () => null, useArtistCoverRef: () => null }));
vi.mock('@/cover/CoverArtImage', () => ({ CoverArtImage: () => null }));
vi.mock('@/cover/wakeCoverBackfillForMissingMetadata', () => ({ wakeCoverBackfillForMissingMetadata: vi.fn() }));

import MostPlayed from './MostPlayed';

const SERVER = { id: 'srv', name: 'Home', url: 'https://home.test', username: 'u', password: 'p' };

describe('Most Played in the touch shell', () => {
  beforeEach(() => {
    resetAuthStore();
    useAuthStore.setState({ activeServerId: SERVER.id, servers: [SERVER], libraryBrowseServerIds: [SERVER.id] });
    mocks.fetchMostPlayedAlbums.mockReset().mockResolvedValue({
      albums: [{ serverId: SERVER.id, id: 'a1', name: 'Golden Hour', artist: 'Sundial', artistId: 'ar1', playCount: 28 }],
      artists: [{ serverId: SERVER.id, id: 'ar1', name: 'Sundial', playCount: 28 }],
      hasMore: false,
    });
  });

  it('has the title alone with sort and the compilations filter as chips under it', async () => {
    const { container } = renderWithProviders(<MostPlayed />);
    expect(screen.getByRole('heading', { level: 1, name: 'Most Played' })).toBeInTheDocument();
    expect(container.querySelector('.mp-header')).toBeNull();
    await screen.findByText('Golden Hour');
    const sort = screen.getByRole('button', { name: /Most plays first/ });
    fireEvent.click(sort);
    expect(screen.getByRole('button', { name: /Fewest plays first/ })).toBeInTheDocument();
    const compilations = screen.getByRole('button', { name: /Hide compilations/ });
    expect(compilations).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(compilations);
    expect(compilations).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: /Hide compilations/ })).toHaveLength(1);
  });
});
