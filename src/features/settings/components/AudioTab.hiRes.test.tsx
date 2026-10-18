import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { AudioTab } from './AudioTab';

vi.mock('@/features/playback/hooks/useAudioDevicesProbe', () => ({
  useAudioDevicesProbe: () => ({
    audioDevices: [],
    osDefaultAudioDeviceId: null,
    deviceSwitching: false,
    devicesLoading: false,
    setDeviceSwitching: vi.fn(),
    refreshAudioDevices: vi.fn(),
  }),
}));

describe('AudioTab hi-res settings (desktop)', () => {
  beforeEach(resetAuthStore);

  it('offers native hi-res playback', () => {
    renderWithProviders(<AudioTab />);

    expect(screen.getByRole('checkbox', { name: 'Enable native hi-res playback' })).toBeInTheDocument();
  });
});
