import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeTrack, seedQueue } from '@/test/helpers/factories';
import { useLiveSearchScopeStore } from '@/store/liveSearchScopeStore';
import { useOrbitStore } from '@/features/orbit';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import MobileSearchOverlay from '@/features/search/components/MobileSearchOverlay';

const mocks = vi.hoisted(() => ({ suggestOrbitTrack: vi.fn(async () => {}), showToast: vi.fn() }));

vi.mock('@/features/orbit/utils/orbit', async importOriginal => ({
  ...await importOriginal<typeof import('@/features/orbit/utils/orbit')>(),
  suggestOrbitTrack: mocks.suggestOrbitTrack,
}));
vi.mock('@/lib/dom/toast', () => ({ showToast: mocks.showToast }));
vi.mock('@/features/search/hooks/useShareSearch', () => ({ useShareSearch: () => ({ shareMatch: null }) }));
vi.mock('@/features/search/hooks/useLiveSearchQuery', () => ({
  useLiveSearchQuery: ({ setResults }: { setResults: (r: unknown) => void }) => {
    useEffect(() => {
      setResults({ artists: [], albums: [], songs: [{ id: 's1', title: 'Chaos', artist: 'Band', serverId: 'srv' }] });
    }, [setResults]);
  },
}));
vi.mock('@/cover/AlbumCoverArtImage', () => ({ AlbumCoverArtImage: () => null }));
vi.mock('@/cover/ArtistCoverArtImage', () => ({ ArtistCoverArtImage: () => null }));
vi.mock('@/cover/CoverArtImage', () => ({ CoverArtImage: () => null }));

describe('MobileSearchOverlay song tap in an Orbit session (desktop narrow window)', () => {
  it('adds the song to the local queue with the queue notice, as it always has', async () => {
    resetAllStores();
    seedQueue([makeTrack({ id: 'playing' })]);
    useLiveSearchScopeStore.setState({ query: 'chaos', scope: null, undoStack: [] });
    useOrbitStore.setState({ role: 'guest', phase: 'active' });
    renderWithProviders(<MobileSearchOverlay onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('Chaos'));
    expect(mocks.suggestOrbitTrack).not.toHaveBeenCalled();
    expect(usePlayerStore.getState().queueItems.map(r => r.trackId)).toEqual(['playing', 's1']);
    expect(mocks.showToast).toHaveBeenCalledWith(expect.stringMatching(/Chaos/), 2200, 'info');
  });
});
