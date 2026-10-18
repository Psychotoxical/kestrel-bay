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

describe('AudioTab (touch shell)', () => {
  beforeEach(resetAuthStore);

  it('leaves out native hi-res playback: the iPhone output stays at 48 kHz', () => {
    renderWithProviders(<AudioTab />);

    expect(screen.queryByRole('checkbox', { name: 'Enable native hi-res playback' })).not.toBeInTheDocument();
  });

  it('leaves out playback speed and track previews: the touch player has no speed control, the touch song lists no preview buttons', () => {
    renderWithProviders(<AudioTab />);

    expect(screen.queryByRole('checkbox', { name: 'Enable playback speed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Enable track previews' })).not.toBeInTheDocument();
  });
});
