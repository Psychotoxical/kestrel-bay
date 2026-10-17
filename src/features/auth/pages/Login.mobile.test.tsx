import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { prepareTouchDocument } from '@/lib/dom/touchDocument';

vi.mock('@/lib/api/subsonic', () => ({
  pingWithCredentialsForProfile: vi.fn(),
  scheduleInstantMixProbeForServer: vi.fn(),
}));

import Login from './Login';

describe('Login in the touch shell', () => {
  beforeEach(() => {
    resetAuthStore();
  });

  it('calls itself a music player, not a desktop player', () => {
    renderWithProviders(<Login />, { route: '/login' });
    expect(screen.getByText('Your Navidrome Music Player')).toBeInTheDocument();
    expect(screen.queryByText('Your Navidrome Desktop Player')).not.toBeInTheDocument();
  });

  it('the keyboard neither capitalises nor corrects the address and the user name', () => {
    renderWithProviders(<Login />, { route: '/login' });
    const url = screen.getByLabelText('Server URL');
    expect(url).toHaveAttribute('autocapitalize', 'none');
    expect(url).toHaveAttribute('autocorrect', 'off');
    expect(url).toHaveAttribute('inputmode', 'url');
    expect(screen.getByLabelText('Username')).toHaveAttribute('autocapitalize', 'none');
  });

  it('the page is set up for touch before the app shell exists: touch styles on, no zoom', () => {
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
    document.head.appendChild(meta);
    try {
      prepareTouchDocument();
      expect(document.documentElement).toHaveAttribute('data-mobile-app', 'true');
      expect(meta.content).toContain('maximum-scale=1.0');
    } finally {
      meta.remove();
    }
  });
});
