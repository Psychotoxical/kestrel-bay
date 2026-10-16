import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emit } from '@tauri-apps/api/event';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeTrack, seedQueue } from '@/test/helpers/factories';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import MobileIosBridge from './MobileIosBridge';
import MobilePlayer from './MobilePlayer';

const landscapeCalls = () => vi.mocked(emit).mock.calls
  .filter(([event]) => event === 'ios:allow-landscape')
  .map(([, allowed]) => allowed);

describe('iPhone orientation: only the player may turn sideways', () => {
  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
    vi.mocked(emit).mockClear();
  });

  it('the shell starts upright', () => {
    renderWithProviders(<MobileIosBridge />);
    expect(landscapeCalls()).toEqual([false]);
  });

  it('opening the player allows landscape, closing it turns upright again', () => {
    seedQueue([makeTrack({ title: 'Chaos' })]);
    const { unmount } = renderWithProviders(<MobilePlayer />, { route: '/now-playing' });
    expect(landscapeCalls()).toEqual([true]);
    unmount();
    expect(landscapeCalls()).toEqual([true, false]);
  });

  it('a shell started on the player keeps landscape allowed', () => {
    seedQueue([makeTrack({ title: 'Chaos' })]);
    renderWithProviders(<><MobilePlayer /><MobileIosBridge /></>, { route: '/now-playing' });
    const calls = landscapeCalls();
    expect(calls[calls.length - 1]).toBe(true);
  });
});
