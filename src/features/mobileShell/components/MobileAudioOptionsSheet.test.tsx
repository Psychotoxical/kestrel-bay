import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import MobileAudioOptionsSheet from './MobileAudioOptionsSheet';

const sheet = () => screen.getByRole('dialog', { name: 'Audio' });

describe('MobileAudioOptionsSheet', () => {
  beforeEach(() => {
    resetAuthStore();
    useAuthStore.setState({ normalizationEngine: 'off', replayGainEnabled: false, loudnessTargetLufs: -14 });
  });

  it('holds the track transitions and the normalization switch', () => {
    renderWithProviders(<MobileAudioOptionsSheet radio={false} onClose={vi.fn()} />);
    expect(within(sheet()).getByRole('heading', { name: 'Track transitions' })).toBeInTheDocument();
    expect(within(sheet()).getByRole('button', { name: /Gapless/ })).toBeInTheDocument();
    expect(within(sheet()).getByRole('radiogroup', { name: 'Normalization' })).toBeInTheDocument();
  });

  it('normalization switches like the settings do and shows the LUFS target', () => {
    renderWithProviders(<MobileAudioOptionsSheet radio={false} onClose={vi.fn()} />);
    expect(within(sheet()).getByRole('radio', { name: 'Off' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(within(sheet()).getByRole('radio', { name: 'ReplayGain' }));
    expect(useAuthStore.getState()).toMatchObject({ normalizationEngine: 'replaygain', replayGainEnabled: true });
    fireEvent.click(within(sheet()).getByRole('radio', { name: 'LUFS' }));
    expect(useAuthStore.getState()).toMatchObject({ normalizationEngine: 'loudness', replayGainEnabled: false, loudnessTargetLufs: -12 });
    expect(within(sheet()).getByRole('radio', { name: '−12 LUFS' })).toHaveAttribute('aria-checked', 'true');
  });

  it('radio: no track transitions, only normalization', () => {
    renderWithProviders(<MobileAudioOptionsSheet radio onClose={vi.fn()} />);
    expect(within(sheet()).queryByRole('heading', { name: 'Track transitions' })).toBeNull();
    expect(within(sheet()).getByRole('radiogroup', { name: 'Normalization' })).toBeInTheDocument();
  });
});
