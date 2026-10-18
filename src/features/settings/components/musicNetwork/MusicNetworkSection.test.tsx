import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { MusicNetworkSection } from './MusicNetworkSection';

beforeEach(() => {
  resetAllStores();
  useAuthStore.setState({ advancedSettingsEnabled: true });
});

describe('MusicNetworkSection (desktop)', () => {
  it('offers the manual force scrobble with advanced settings on', () => {
    renderWithProviders(<MusicNetworkSection />);

    expect(screen.getByRole('checkbox', { name: 'Manual force scrobble' })).toBeInTheDocument();
  });
});
