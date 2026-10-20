import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { makeServer } from '@/test/helpers/factories';
import { useAuthStore } from '@/store/authStore';
import { useCoverStrategyStore } from '@/store/coverStrategyStore';
import { useMobileActionSheetStore } from '@/features/mobileShell/store/mobileActionSheetStore';
import { serverIndexKeyForProfile } from '@/lib/server/serverIndexKey';

vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@/lib/api/coverCache', () => ({
  coverCacheClearServer: vi.fn(async () => {}),
  coverCacheStatsServer: vi.fn(async () => ({ bytes: 385 * 1024 * 1024, entryCount: 900 })),
  libraryCoverProgress: vi.fn(async () => ({ done: 0, totalDistinct: 0, pending: 0 })),
  libraryCoverCatalogSize: vi.fn(async () => 0),
}));
const imageCache = vi.hoisted(() => ({ bytes: 0 }));
vi.mock('@/cover', () => ({
  clearImageCache: vi.fn(async () => {}),
  getImageCacheSize: vi.fn(async () => imageCache.bytes),
}));
vi.mock('@/cover/diskSrcCache', () => ({ clearDiskSrcCacheForServer: vi.fn() }));
vi.mock('@/lib/library/coverBackfillWake', () => ({ wakeLibraryCoverBackfill: vi.fn() }));

import { coverCacheClearServer } from '@/lib/api/coverCache';
import CoverCacheStrategySection from './CoverCacheStrategySection';

const server = makeServer({ id: 'hq', name: 'Psysonic HQ', url: 'https://music.example' });

describe('CoverCacheStrategySection (touch shell)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    imageCache.bytes = 0;
    useAuthStore.setState({ servers: [server], activeServerId: server.id });
    useCoverStrategyStore.setState({ strategyByServer: {} });
  });

  it('lists each server as a group with a strategy switch and the space it uses', async () => {
    renderWithProviders(<CoverCacheStrategySection />);
    expect(screen.getByText('Psysonic HQ')).toBeInTheDocument();
    expect(await screen.findByText('385.0 MB')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Aggressive' }));
    expect(useCoverStrategyStore.getState().getStrategyForServer(server.id)).toBe('aggressive');
    expect(screen.getByRole('radio', { name: 'Aggressive' })).toHaveAttribute('aria-checked', 'true');
  });

  it('clearing asks first and clears only after the answer', async () => {
    renderWithProviders(<CoverCacheStrategySection />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear cover cache' }));
    expect(useMobileActionSheetStore.getState().isOpen).toBe(true);
    expect(coverCacheClearServer).not.toHaveBeenCalled();

    act(() => useMobileActionSheetStore.getState().choose('clear'));
    await waitFor(() => expect(coverCacheClearServer).toHaveBeenCalledWith(serverIndexKeyForProfile(server)));
  });

  it('closing the question clears nothing', async () => {
    renderWithProviders(<CoverCacheStrategySection />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear cover cache' }));
    act(() => useMobileActionSheetStore.getState().choose(null));
    await Promise.resolve();
    expect(coverCacheClearServer).not.toHaveBeenCalled();
  });

  it('shows the in-browser previews only when they hold something', async () => {
    imageCache.bytes = 2048;
    renderWithProviders(<CoverCacheStrategySection />);
    expect(await screen.findByText('In-browser previews')).toBeInTheDocument();
  });

  it('hides empty in-browser previews', async () => {
    renderWithProviders(<CoverCacheStrategySection />);
    await screen.findByText('385.0 MB');
    expect(screen.queryByText('In-browser previews')).not.toBeInTheDocument();
  });
});
