import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { makeInitialOrbitState, ORBIT_DEFAULT_SETTINGS, type OrbitQueueItem } from '@/features/orbit/api/orbit';
import { useOrbitStore } from '@/features/orbit/store/orbitStore';
import { suggestionKey } from '@/features/orbit/utils/helpers';
import HostApprovalQueue from '@/features/orbit/components/HostApprovalQueue';
import { useOrbitPendingApprovalCount } from './useOrbitPendingApprovalCount';

vi.mock('@/lib/api/subsonicLibrary', () => ({ getSongForServer: vi.fn(async () => null) }));

const item = (trackId: string, addedBy: string, addedAt: number): OrbitQueueItem => ({ trackId, addedBy, addedAt });

function seed({ autoApprove = false, role = 'host' as 'host' | 'guest' } = {}) {
  const base = makeInitialOrbitState({ sid: 'sess', host: 'host', name: 'Room' });
  const queue = [
    item('h1', 'host', 1),        // host-authored: never pending
    item('g1', 'guest1', 2),
    item('g2', 'guest2', 3),
    item('g3', 'guest1', 4),      // merged below
    item('g4', 'guest2', 5),      // declined below
  ];
  useOrbitStore.setState({
    role,
    phase: 'active',
    serverId: 'srv',
    state: { ...base, queue, settings: { ...ORBIT_DEFAULT_SETTINGS, autoApprove } },
    mergedSuggestionKeys: [suggestionKey(queue[3])],
    declinedSuggestionKeys: [suggestionKey(queue[4])],
  });
}

const listedByApprovalQueue = () => {
  const { container, unmount } = renderWithProviders(<HostApprovalQueue />);
  const count = Number(container.querySelector('.host-approval__count')?.textContent ?? 0);
  unmount();
  return count;
};

describe('useOrbitPendingApprovalCount', () => {
  beforeEach(() => {
    useOrbitStore.setState({ role: null, phase: 'idle', state: null, mergedSuggestionKeys: [], declinedSuggestionKeys: [] });
  });

  it('counts exactly what the approval list shows', () => {
    seed();
    const { result } = renderHook(() => useOrbitPendingApprovalCount());
    expect(result.current).toBe(2);
    expect(result.current).toBe(listedByApprovalQueue());
  });

  it('is 0 with auto-approve on, for a guest and outside a session — like the list, which then hides', () => {
    for (const setup of [{ autoApprove: true }, { role: 'guest' as const }]) {
      seed(setup);
      const { result, unmount } = renderHook(() => useOrbitPendingApprovalCount());
      expect(result.current).toBe(0);
      expect(listedByApprovalQueue()).toBe(0);
      unmount();
    }
    useOrbitStore.setState({ role: null, state: null });
    expect(renderHook(() => useOrbitPendingApprovalCount()).result.current).toBe(0);
  });
});
