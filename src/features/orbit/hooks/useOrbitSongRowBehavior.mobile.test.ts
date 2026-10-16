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

describe('useOrbitSongRowBehavior (touch shell)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    orbitMocks.suggestOrbitTrack.mockClear();
    orbitMocks.hostEnqueueToOrbit.mockClear();
    orbitMocks.showToast.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    useOrbitStore.setState({ role: null });
  });

  it('a guest tap suggests that one track instead of showing the double-click hint', () => {
    useOrbitStore.setState({ role: 'guest' });
    const { result } = renderHook(() => useOrbitSongRowBehavior());
    act(() => { result.current.orbitRowClick('s1', 'srv'); });
    act(() => { vi.advanceTimersByTime(250); });
    expect(orbitMocks.suggestOrbitTrack).toHaveBeenCalledExactlyOnceWith('s1', 'srv');
    expect(orbitMocks.showToast).not.toHaveBeenCalledWith(expect.stringMatching(/orbitDoubleClickHint|double-click/i), 2400, 'info');
  });

  it('a host tap adds the track to the shared queue', () => {
    useOrbitStore.setState({ role: 'host' });
    const { result } = renderHook(() => useOrbitSongRowBehavior());
    act(() => { result.current.orbitRowClick('s1', 'srv'); });
    expect(orbitMocks.hostEnqueueToOrbit).toHaveBeenCalledExactlyOnceWith('s1', 'srv');
    expect(orbitMocks.suggestOrbitTrack).not.toHaveBeenCalled();
  });

  it('a quick double tap (click, click, dblclick) adds the track once', () => {
    useOrbitStore.setState({ role: 'guest' });
    const { result } = renderHook(() => useOrbitSongRowBehavior());
    act(() => {
      result.current.orbitRowClick('s1', 'srv');
      result.current.orbitRowClick('s1', 'srv');
      result.current.addTrackToOrbit('s1', 'srv');
    });
    expect(orbitMocks.suggestOrbitTrack).toHaveBeenCalledTimes(1);
  });

  it('another track, or the same one a moment later, is added again', () => {
    useOrbitStore.setState({ role: 'guest' });
    const { result } = renderHook(() => useOrbitSongRowBehavior());
    act(() => {
      result.current.orbitRowClick('s1', 'srv');
      result.current.orbitRowClick('s2', 'srv');
    });
    expect(orbitMocks.suggestOrbitTrack).toHaveBeenCalledTimes(2);
    act(() => { vi.advanceTimersByTime(1100); });
    act(() => { result.current.orbitRowClick('s1', 'srv'); });
    expect(orbitMocks.suggestOrbitTrack).toHaveBeenCalledTimes(3);
  });
});
