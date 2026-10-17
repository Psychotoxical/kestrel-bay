import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';

const offline = vi.hoisted(() => ({ active: false }));

vi.mock('@/features/offline', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline')>()),
  useOfflineBrowseActive: () => offline.active,
}));

import MobileOrbitHub from './MobileOrbitHub';

describe('Orbit tab', () => {
  beforeEach(() => {
    resetAllStores();
    offline.active = false;
  });

  it('online it offers to create or join a session', () => {
    renderWithProviders(<MobileOrbitHub />);
    expect(screen.getByRole('button', { name: 'Create a session' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Join a session' })).toBeEnabled();
    expect(screen.queryByText(/Orbit needs the server/)).not.toBeInTheDocument();
  });

  it('offline it greys out create and join and says why; help stays', () => {
    offline.active = true;
    renderWithProviders(<MobileOrbitHub />);
    expect(screen.getByText(/Orbit needs the server/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a session' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Join a session' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'How does this work?' })).toBeEnabled();
  });
});
