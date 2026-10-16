import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useOrbitStore } from '@/features/orbit/store/orbitStore';
import { useOrbitSongRowBehavior } from './useOrbitSongRowBehavior';

const orbitMocks = vi.hoisted(() => ({
  suggestOrbitTrack: vi.fn(async () => {}),
  hostEnqueueToOrbit: vi.fn(async () => {}),
  showToast: vi.fn(),
}));

vi.mock('@/features/orbit/utils/orbit', () => ({
  suggestOrbitTrack: orbitMocks.suggestOrbitTrack,
  hostEnqueueToOrbit: orbitMocks.hostEnqueueToOrbit,
  evaluateOrbitSuggestGate: () => ({ allowed: true }),
  OrbitSuggestBlockedError: class extends Error {},
}));
vi.mock('@/lib/dom/toast', () => ({ showToast: orbitMocks.showToast }));

describe('useOrbitSongRowBehavior (desktop)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    orbitMocks.suggestOrbitTrack.mockClear();
    orbitMocks.hostEnqueueToOrbit.mockClear();
    orbitMocks.showToast.mockClear();
    useOrbitStore.setState({ role: 'guest' });
  });
  afterEach(() => {
    vi.useRealTimers();
    useOrbitStore.setState({ role: null });
  });

  it('a single click in a session only shows the double-click hint', () => {
    const { result } = renderHook(() => useOrbitSongRowBehavior());
    act(() => { result.current.orbitRowClick('s1', 'srv'); });
    act(() => { vi.advanceTimersByTime(250); });
    expect(orbitMocks.suggestOrbitTrack).not.toHaveBeenCalled();
    expect(orbitMocks.showToast).toHaveBeenCalledWith(expect.stringMatching(/orbitDoubleClickHint|double-click/i), 2400, 'info');
  });

  it('the double click adds the track, and every double click adds it again', () => {
    const { result } = renderHook(() => useOrbitSongRowBehavior());
    act(() => {
      result.current.addTrackToOrbit('s1', 'srv');
      result.current.addTrackToOrbit('s1', 'srv');
    });
    expect(orbitMocks.suggestOrbitTrack).toHaveBeenCalledTimes(2);
    expect(orbitMocks.suggestOrbitTrack).toHaveBeenCalledWith('s1', 'srv');
  });
});
