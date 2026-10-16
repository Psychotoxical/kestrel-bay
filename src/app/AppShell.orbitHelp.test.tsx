import { beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom has no Tauri window/webview: every method is an async no-op.
const tauriHandle = vi.hoisted(() => new Proxy({}, {
  get: () => async () => () => {},
}));
vi.mock('@tauri-apps/api/window', async importOriginal => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/window')>()),
  getCurrentWindow: () => tauriHandle,
}));
vi.mock('@tauri-apps/api/webview', async importOriginal => ({
  ...(await importOriginal<typeof import('@tauri-apps/api/webview')>()),
  getCurrentWebview: () => tauriHandle,
}));

import { act } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { onInvoke, registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { useHelpModalStore, useOrbitAccountPickerStore } from '@/features/orbit';
import { makeServer } from '@/test/helpers/factories';
import { AppShell } from './AppShell';

describe('AppShell Orbit help (desktop)', () => {
  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
    onInvoke('library_cover_backfill_set_ui_priority', () => undefined);
  });

  it('keeps the desktop help modal; the touch sheet never mounts', async () => {
    renderWithProviders(<AppShell />, { route: '/' });
    await act(async () => { useHelpModalStore.getState().open(); });
    expect(document.querySelector('.orbit-help-modal')).not.toBeNull();
    expect(document.querySelector('.mobile-sheet--orbit-help')).toBeNull();
    act(() => { useHelpModalStore.getState().close(); });
  });

  it('keeps the desktop account picker; the touch sheet never mounts', async () => {
    renderWithProviders(<AppShell />, { route: '/' });
    await act(async () => { void useOrbitAccountPickerStore.getState().request([makeServer({ id: 'a' }), makeServer({ id: 'b' })]); });
    expect(document.querySelector('.orbit-account-picker')).not.toBeNull();
    expect(document.querySelector('.mobile-sheet')).toBeNull();
    act(() => { useOrbitAccountPickerStore.getState().cancel(); });
  });
});
