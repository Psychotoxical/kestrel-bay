import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { useIdlePlayQueuePull } from './useIdlePlayQueuePull';

const pullMocks = vi.hoisted(() => ({
  applyServerPlayQueue: vi.fn(async () => 'applied' as const),
}));
vi.mock('@/features/playback/store/applyServerPlayQueue', () => ({
  applyServerPlayQueue: pullMocks.applyServerPlayQueue,
}));
vi.mock('@/app/hooks/usePlayQueueSyncLedState', () => ({
  canAutoIdlePlayQueuePull: (status: string) => status === 'connected',
}));
vi.mock('@/features/orbit', async () => {
  const { create } = await import('zustand');
  return { useOrbitStore: create(() => ({ role: null })) };
});

beforeEach(() => {
  pullMocks.applyServerPlayQueue.mockClear();
  usePlayerStore.setState({
    isPlaying: false,
    queueItems: [{ serverId: 'srv-1', trackId: 't1' }],
  });
});

describe('useIdlePlayQueuePull (touch shell)', () => {
  it('takes the server position once at startup, before anything plays', () => {
    const { rerender, unmount } = renderHook(() => useIdlePlayQueuePull('connected'));
    expect(pullMocks.applyServerPlayQueue).toHaveBeenCalledExactlyOnceWith(
      'srv-1',
      { mode: 'idle', preferServerPosition: true },
    );
    usePlayerStore.setState({ queueItems: [{ serverId: 'srv-1', trackId: 't2' }] });
    rerender();
    expect(pullMocks.applyServerPlayQueue).toHaveBeenCalledOnce();
    unmount();
  });

  it('waits for the connection before the startup pull', () => {
    let status = 'connecting';
    const { rerender, unmount } = renderHook(() => useIdlePlayQueuePull(status as 'connected'));
    expect(pullMocks.applyServerPlayQueue).not.toHaveBeenCalled();
    status = 'connected';
    rerender();
    expect(pullMocks.applyServerPlayQueue).toHaveBeenCalledOnce();
    unmount();
  });

  it('skips the startup pull when playback already runs', () => {
    usePlayerStore.setState({ isPlaying: true });
    const { unmount } = renderHook(() => useIdlePlayQueuePull('connected'));
    expect(pullMocks.applyServerPlayQueue).not.toHaveBeenCalled();
    unmount();
  });
});
