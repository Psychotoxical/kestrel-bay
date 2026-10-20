import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { useLocalPlaybackStore } from '@/store/localPlaybackStore';

vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('@/lib/api/syncfs', () => ({ getMediaTierSize: vi.fn(async () => 1.5 * 1024 * 1024 * 1024) }));
vi.mock('@/features/settings/components/TouchDownloadsStorage', () => ({ default: () => null }));
vi.mock('@/features/settings/components/CoverCacheStrategySection', () => ({ default: () => null }));

import { formatBytes } from '@/lib/format/formatBytes';
import { StorageTab } from './StorageTab';

describe('StorageTab playback cache (touch shell)', () => {
  const purge = vi.fn(async () => {});

  beforeEach(() => {
    purge.mockClear();
    useAuthStore.setState({ hotCacheEnabled: true, hotCacheMaxMb: 4096, hotCacheDebounceSec: 5, mediaDir: '' });
    useLocalPlaybackStore.setState({ purgeEphemeralDisk: purge });
  });

  it('shows the cache as a list: switch, space used, tracks, both sliders and a clear row', async () => {
    renderWithProviders(<StorageTab />);
    expect(screen.getByRole('checkbox', { name: 'Enable hot playback cache' })).toBeChecked();
    expect(await screen.findByText(formatBytes(1.5 * 1024 * 1024 * 1024))).toBeInTheDocument();
    expect(screen.getByText('Tracks in cache')).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Maximum cache size' })).toHaveValue('4096');
    expect(screen.getByText('5 s')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear hot cache' }));
    await waitFor(() => expect(purge).toHaveBeenCalled());
  });

  it('switching it off empties the cache and hides the details', async () => {
    renderWithProviders(<StorageTab />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Enable hot playback cache' }));
    await waitFor(() => expect(useAuthStore.getState().hotCacheEnabled).toBe(false));
    expect(purge).toHaveBeenCalled();
    expect(screen.queryByText('Tracks in cache')).not.toBeInTheDocument();
  });
});
