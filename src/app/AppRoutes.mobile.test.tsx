import { Suspense } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import AppRoutes from './AppRoutes';

function renderAt(route: string) {
  return renderWithProviders(
    <Suspense fallback={null}><AppRoutes /></Suspense>,
    { route },
  );
}

describe('AppRoutes in the touch shell build', () => {
  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
  });

  it('/library is the Library tab root', async () => {
    renderAt('/library');
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Library' })).toBeInTheDocument();
  });

  it('/orbit is the Orbit tab root', async () => {
    renderAt('/orbit');
    expect(await screen.findByText('Create a session')).toBeInTheDocument();
    expect(screen.getByText('Join a session')).toBeInTheDocument();
  });

  it('/now-playing is the full-screen touch player', () => {
    const { container } = renderAt('/now-playing');
    expect(container.querySelector('.mobile-player')).not.toBeNull();
    expect(container.querySelector('.mp-view')).toBeNull();
  });
});
