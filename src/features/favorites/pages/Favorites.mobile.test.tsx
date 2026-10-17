import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';

const mocks = vi.hoisted(() => ({
  offline: false,
  scheduleFavoritesOfflineSync: vi.fn(),
  // Stable references: the page syncs from these, fresh arrays per render would loop.
  data: {
    albums: [],
    artists: [],
    songs: [],
    radioStations: [],
    topFavoriteArtists: [],
    setSongs: () => {},
    setRadioStations: () => {},
    loading: false,
    unfavoriteStation: () => {},
  },
}));

vi.mock('@/features/favorites/hooks/useFavoritesData', () => ({
  useFavoritesData: () => mocks.data,
}));
vi.mock('@/features/offline', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline')>()),
  useOfflineBrowseActive: () => mocks.offline,
  scheduleFavoritesOfflineSync: mocks.scheduleFavoritesOfflineSync,
}));

import Favorites from './Favorites';

describe('Favorites in the touch shell', () => {
  beforeEach(() => {
    resetAllStores();
    mocks.offline = false;
    mocks.scheduleFavoritesOfflineSync.mockReset();
  });

  it('saving favorites for offline is a labelled switch under the title', () => {
    renderWithProviders(<Favorites />);
    expect(screen.getByRole('heading', { name: 'Favorites' })).toBeInTheDocument();
    const sw = screen.getByRole('switch', { name: 'Save your favorites for offline listening' });
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(useAuthStore.getState().favoritesOfflineEnabled).toBe(true);
    expect(mocks.scheduleFavoritesOfflineSync).toHaveBeenCalled();
  });

  it('online with no favorites it says there are none yet', () => {
    renderWithProviders(<Favorites />);
    expect(screen.getByText("You haven't saved any favorites yet.")).toBeInTheDocument();
  });

  it('offline it says only favorites saved on the device show, not that there are none', () => {
    mocks.offline = true;
    renderWithProviders(<Favorites />);
    expect(screen.queryByText("You haven't saved any favorites yet.")).not.toBeInTheDocument();
    expect(screen.getByText(/Offline, only favorites saved on this device are here/)).toBeInTheDocument();
  });
});
