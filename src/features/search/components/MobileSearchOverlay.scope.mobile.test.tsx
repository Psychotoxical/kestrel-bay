import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useLiveSearchScopeStore } from '@/store/liveSearchScopeStore';
import MobileSearchOverlay from '@/features/search/components/MobileSearchOverlay';

const seen = vi.hoisted(() => ({ scopes: [] as unknown[] }));

vi.mock('@/features/search/hooks/useShareSearch', () => ({ useShareSearch: () => ({ shareMatch: null }) }));
vi.mock('@/features/search/hooks/useLiveSearchQuery', () => ({
  useLiveSearchQuery: ({ query, scope, setResults }: { query: string; scope: unknown; setResults: (r: unknown) => void }) => {
    seen.scopes.push(scope);
    useEffect(() => {
      setResults(query
        ? { artists: [], albums: [{ id: 'al1', name: 'Age of Winters', artist: 'The Sword', serverId: 'srv' }], songs: [] }
        : null);
    }, [query, setResults]);
  },
}));
vi.mock('@/cover/AlbumCoverArtImage', () => ({ AlbumCoverArtImage: () => null }));
vi.mock('@/cover/ArtistCoverArtImage', () => ({ ArtistCoverArtImage: () => null }));
vi.mock('@/cover/CoverArtImage', () => ({ CoverArtImage: () => null }));

describe('MobileSearchOverlay opened on a browse page (touch shell)', () => {
  beforeEach(() => {
    resetAllStores();
    seen.scopes = [];
    // The Albums page sets this scope by itself.
    useLiveSearchScopeStore.setState({ query: '', scope: 'albums', undoStack: [] });
  });

  it('runs the full search and lists the albums it finds', async () => {
    renderWithProviders(<MobileSearchOverlay onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Age' } });

    expect(await screen.findByText('Age of Winters')).toBeInTheDocument();
    expect(seen.scopes.every(s => s === null)).toBe(true);
  });

  it('leaves the page under it unfiltered', () => {
    renderWithProviders(<MobileSearchOverlay onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Age' } });
    expect(useLiveSearchScopeStore.getState().query).toBe('');
    expect(document.querySelector('.mobile-search-scope-badge')).toBeNull();
  });
});
