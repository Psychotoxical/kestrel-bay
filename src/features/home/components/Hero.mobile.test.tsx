import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';

vi.mock('@/cover/CoverArtImage', () => ({
  CoverArtImage: ({ alt, displayCssPx }: { alt: string; displayCssPx: number }) => (
    <img alt={alt} data-css-px={displayCssPx} />
  ),
}));
vi.mock('@/cover/useLibraryCoverRef', () => ({ useAlbumCoverRef: () => ({ id: 'cover-1' }) }));
vi.mock('@/cover/useArtistFanart', () => ({ useArtistBanner: () => null, useArtistFanart: () => null }));
vi.mock('@/cover/useCoverArt', () => ({ useCoverArt: () => ({ src: '', cacheKey: '' }) }));
vi.mock('@/cover/useHeroBackdrop', () => ({ useHeroBackdrop: () => ({ url: '', position: 'center' }) }));
vi.mock('@/ui/CachedImage', () => ({ useCachedUrl: () => '' }));

import Hero from './Hero';

const album = {
  id: 'al1', name: 'Vadak', artist: 'Thy Catafalque', artistId: 'ar1', coverArt: 'al1',
  year: 2021, genre: 'Avant-garde Metal', songCount: 9, duration: 3600,
} as SubsonicAlbum;

describe('Hero (touch shell)', () => {
  it('shows the whole cover, sharp, above the glass bar', () => {
    renderWithProviders(<Hero albums={[album]} />);
    const cover = screen.getByAltText('Vadak Cover');
    expect(cover.closest('.hero-cover-mobile')).not.toBeNull();
    expect(cover.closest('.hero-content')).toBeNull();
    expect(screen.getByText('Vadak')).toBeInTheDocument();
  });
});
