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

describe('MusicNetworkSection (touch shell)', () => {
  it('leaves out the manual force scrobble: the touch player has no control for it', () => {
    renderWithProviders(<MusicNetworkSection />);

    expect(screen.queryByRole('checkbox', { name: 'Manual force scrobble' })).not.toBeInTheDocument();
  });
});
