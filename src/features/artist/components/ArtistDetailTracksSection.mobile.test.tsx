import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/features/artist/hooks/useArtistAllTracks', () => ({
  useArtistAllTracks: () => ({ tracks: [], loading: false, failed: false }),
}));
vi.mock('@/features/artist/components/ArtistDetailTopTracks', () => ({
  default: () => <div data-testid="top-list" />,
}));
vi.mock('@/features/artist/components/ArtistAllTracksList', () => ({
  default: () => <div data-testid="all-list" />,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import ArtistDetailTracksSection from '@/features/artist/components/ArtistDetailTracksSection';

describe('ArtistDetailTracksSection in the touch shell', () => {
  it('has no column picker on either tab', () => {
    const { container } = render(
      <ArtistDetailTracksSection
        topSongs={[]}
        topSongsLoading={false}
        albums={[]}
        marginTop="0"
        playTopSongWithContinuation={vi.fn()}
        scopes={[{ serverId: 'srv-1', libraryId: null }]}
        serverId="srv-1"
        artistId="ar-1"
        onPlayAllTracks={vi.fn()}
      />,
    );
    expect(container.querySelector('.artist-tracks-picker')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'artistDetail.tracksTabAll' }));
    expect(screen.getByTestId('all-list')).toBeTruthy();
    expect(container.querySelector('.artist-tracks-picker')).toBeNull();
  });
});
