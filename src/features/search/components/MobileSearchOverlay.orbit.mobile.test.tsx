import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useLiveSearchScopeStore } from '@/store/liveSearchScopeStore';
import { useOrbitStore } from '@/features/orbit';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import MobileSearchOverlay from '@/features/search/components/MobileSearchOverlay';

const mocks = vi.hoisted(() => ({
  suggestOrbitTrack: vi.fn(async () => {}),
  hostEnqueueToOrbit: vi.fn(async () => {}),
  showToast: vi.fn(),
}));

vi.mock('@/features/orbit/utils/orbit', async importOriginal => ({
  ...await importOriginal<typeof import('@/features/orbit/utils/orbit')>(),
  suggestOrbitTrack: mocks.suggestOrbitTrack,
  hostEnqueueToOrbit: mocks.hostEnqueueToOrbit,
  evaluateOrbitSuggestGate: () => ({ allowed: true, reason: null }),
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

describe('MobileSearchOverlay song tap in an Orbit session (touch shell)', () => {
  beforeEach(() => {
    resetAllStores();
    Object.values(mocks).forEach(m => m.mockClear());
    useLiveSearchScopeStore.setState({ query: 'chaos', scope: null, undoStack: [] });
  });

  it('a guest suggests the song, with only the session notice', async () => {
    useOrbitStore.setState({ role: 'guest', phase: 'active' });
    const onClose = vi.fn();
    renderWithProviders(<MobileSearchOverlay onClose={onClose} />);
    fireEvent.click(await screen.findByText('Chaos'));
    expect(mocks.suggestOrbitTrack).toHaveBeenCalledWith('s1', 'srv');
    expect(usePlayerStore.getState().queueItems).toHaveLength(0);
    expect(mocks.showToast).not.toHaveBeenCalledWith(expect.stringMatching(/queue/i), expect.anything(), expect.anything());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('the host adds it to the session', async () => {
    useOrbitStore.setState({ role: 'host', phase: 'active' });
    renderWithProviders(<MobileSearchOverlay onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText('Chaos'));
    expect(mocks.hostEnqueueToOrbit).toHaveBeenCalledWith('s1', 'srv');
  });
});
