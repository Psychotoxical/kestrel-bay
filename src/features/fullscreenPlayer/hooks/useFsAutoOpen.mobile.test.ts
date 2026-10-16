import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ isMinimized: async () => false }),
}));
vi.mock('@/lib/hooks/useWindowVisibility', () => ({
  useWindowVisibility: () => false,
}));

import { useFsAutoOpen } from './useFsAutoOpen';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { useAuthStore } from '@/store/authStore';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeTrack } from '@/test/helpers/factories';

describe('useFsAutoOpen (touch shell)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetAllStores();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('never opens the desktop fullscreen player, even with a value from a desktop backup', async () => {
    useAuthStore.setState({ fullscreenAutoOpenMinutes: 1 });
    usePlayerStore.setState({ isPlaying: true, currentTrack: makeTrack(), currentRadio: null });
    renderHook(() => useFsAutoOpen());

    await act(async () => { await vi.advanceTimersByTimeAsync(5 * 60_000); });
    expect(usePlayerStore.getState().isFullscreenOpen).toBe(false);
  });
});
