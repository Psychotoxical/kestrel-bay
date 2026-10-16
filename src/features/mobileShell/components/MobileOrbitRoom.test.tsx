import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeServer } from '@/test/helpers/factories';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { useAuthStore } from '@/store/authStore';
import { makeInitialOrbitState, ORBIT_DEFAULT_SETTINGS } from '@/features/orbit/api/orbit';
import { useOrbitStore } from '@/features/orbit';
import MobileOrbitRoom from './MobileOrbitRoom';

function session(role: 'host' | 'guest', { autoShuffle = true } = {}) {
  const base = makeInitialOrbitState({ sid: 'sess1', host: 'host', name: 'Friday Room' });
  useAuthStore.setState({ servers: [makeServer({ id: 'srv', url: 'https://music.example' })], activeServerId: 'srv' });
  useOrbitStore.setState({
    role, phase: 'active', serverId: 'srv', sessionId: 'sess1',
    state: { ...base, settings: { ...ORBIT_DEFAULT_SETTINGS, autoShuffle } },
  });
}

describe('MobileOrbitRoom', () => {
  const originalShare = navigator.share;
  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
  });
  afterEach(() => {
    Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
  });

  it('names the session and shows the countdown while auto-reshuffle is on', () => {
    session('host');
    renderWithProviders(<MobileOrbitRoom />);
    expect(screen.getByRole('heading', { name: 'Friday Room' })).toBeInTheDocument();
    expect(document.querySelector('.mobile-orbit-room__shuffle')).not.toBeNull();
  });

  it('hides the countdown when the host turned auto-reshuffle off', () => {
    session('host', { autoShuffle: false });
    renderWithProviders(<MobileOrbitRoom />);
    expect(document.querySelector('.mobile-orbit-room__shuffle')).toBeNull();
  });

  it('only the host gets the invite button', () => {
    session('guest');
    renderWithProviders(<MobileOrbitRoom />);
    expect(screen.queryByRole('button', { name: 'Share invite link' })).toBeNull();
  });

  it('invites through the iOS share sheet when the web view offers it', async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    session('host');
    renderWithProviders(<MobileOrbitRoom />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Share invite link' })); });
    expect(share).toHaveBeenCalledOnce();
    expect((share.mock.calls[0] as unknown as [{ text: string }])[0].text).toMatch(/^psysonic/);
    expect(document.querySelector('.mobile-orbit-share__link')).toBeNull();
  });

  it('without it, shows the link with a big copy button that copies it', async () => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    session('host');
    renderWithProviders(<MobileOrbitRoom />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Share invite link' })); });
    const link = document.querySelector('.mobile-orbit-share__link')?.textContent ?? '';
    expect(link).toMatch(/^psysonic/);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy invite link' })); });
    expect(writeText).toHaveBeenCalledWith(link);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});
