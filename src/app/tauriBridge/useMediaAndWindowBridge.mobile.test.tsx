import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NavigateFunction } from 'react-router';
import { emitTauriEvent, tauriMockListenerCount } from '@/test/mocks/tauri';
import { useOrbitStore } from '@/features/orbit';
import { useMediaAndWindowBridge } from './useMediaAndWindowBridge';

const executeRuntimeAction = vi.hoisted(() => vi.fn());
vi.mock('@/config/shortcutActions', async importOriginal => ({
  ...await importOriginal<typeof import('@/config/shortcutActions')>(),
  executeRuntimeAction,
}));

async function mountBridge() {
  const navigate = vi.fn() as unknown as NavigateFunction;
  const hook = renderHook(() => useMediaAndWindowBridge(navigate));
  await waitFor(() => expect(tauriMockListenerCount('media:prev')).toBe(1));
  return hook;
}

describe('useMediaAndWindowBridge media skips (touch shell)', () => {
  afterEach(() => {
    executeRuntimeAction.mockClear();
    useOrbitStore.setState({ role: null, phase: 'idle' });
  });

  it('lock-screen Next / Previous do nothing for an Orbit guest; play-pause still works', async () => {
    useOrbitStore.setState({ role: 'guest', phase: 'active' });
    const { unmount } = await mountBridge();

    emitTauriEvent('media:next', null);
    emitTauriEvent('media:prev', null);
    emitTauriEvent('media:play-pause', null);

    expect(executeRuntimeAction.mock.calls.map(call => call[0])).toEqual(['play-pause']);
    unmount();
  });

  it('the host, and anyone outside a session, can skip', async () => {
    useOrbitStore.setState({ role: 'host', phase: 'active' });
    const { unmount } = await mountBridge();

    emitTauriEvent('media:next', null);
    useOrbitStore.setState({ role: null, phase: 'idle' });
    emitTauriEvent('media:prev', null);

    expect(executeRuntimeAction.mock.calls.map(call => call[0])).toEqual(['next', 'prev']);
    unmount();
  });
});
