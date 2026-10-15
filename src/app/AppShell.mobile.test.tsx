import { beforeEach, describe, expect, it, vi } from 'vitest';

// Desktop window/webview hooks still run in the touch shell; jsdom has no Tauri
// window. Every method is an async no-op (listeners return an unlisten no-op).
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
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeTrack, seedQueue } from '@/test/helpers/factories';
import { onInvoke, registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { AppShell } from './AppShell';

describe('AppShell in the touch shell build', () => {
  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
    onInvoke('library_cover_backfill_set_ui_priority', () => undefined);
  });

  it('renders the touch chrome instead of sidebar, header and player bar', async () => {
    seedQueue([makeTrack({ title: 'Chaos', artist: 'Stormwind' })]);
    const { container } = renderWithProviders(<AppShell />, { route: '/' });
    await act(async () => { await Promise.resolve(); });

    const shell = container.querySelector('.app-shell') as HTMLElement;
    expect(shell).toHaveAttribute('data-mobile-app');
    expect(document.documentElement).toHaveAttribute('data-mobile-app', 'true');

    expect(container.querySelector('.mobile-tabbar')).not.toBeNull();
    expect(container.querySelector('.mobile-miniplayer')).toHaveTextContent('Chaos');
    expect(container.querySelector('.mobile-mainstage-header')).not.toBeNull();

    expect(container.querySelector('.sidebar')).toBeNull();
    expect(container.querySelector('.content-header')).toBeNull();
    expect(container.querySelector('.player-bar')).toBeNull();
    expect(container.querySelector('.bottom-nav')).toBeNull();
  });

  it('hides tab bar and mini player behind the full-screen player', async () => {
    seedQueue([makeTrack({ title: 'Chaos' })]);
    const { container } = renderWithProviders(<AppShell />, { route: '/now-playing' });
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector('.mobile-player')).not.toBeNull();
    expect(container.querySelector('.mobile-tabbar')).toBeNull();
    expect(container.querySelector('.mobile-miniplayer')).toBeNull();
    expect(screen.getAllByText('Chaos').length).toBeGreaterThan(0);
  });

  it('sub-pages get the back button', async () => {
    const { container } = renderWithProviders(<AppShell />, { route: '/settings' });
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector('.mobile-back-bar')).not.toBeNull();
    expect(container.querySelector('.mobile-mainstage-header')).toBeNull();
  });
});
