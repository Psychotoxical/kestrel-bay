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

describe('useIdlePlayQueuePull (desktop)', () => {
  it('does not pull at startup; the idle threshold still applies', () => {
    const { unmount } = renderHook(() => useIdlePlayQueuePull('connected'));
    expect(pullMocks.applyServerPlayQueue).not.toHaveBeenCalled();
    unmount();
  });
});
