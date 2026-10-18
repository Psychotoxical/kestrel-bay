import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';

const navigate = vi.fn();

vi.mock('react-router', async importActual => {
  const actual = await importActual<typeof import('react-router')>();
  return { ...actual, useNavigate: () => navigate };
});

import { AppearanceTab } from './AppearanceTab';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { onInvoke } from '@/test/mocks/tauri';

beforeEach(() => {
  resetAllStores();
  navigate.mockClear();
  onInvoke('is_tiling_wm', () => false);
});

describe('AppearanceTab', () => {
  /**
   * The artist photo is governed by the per-surface backdrop switch, which sits
   * on another tab. People look for it beside the fullscreen style picker, so
   * this button has to land on that section rather than on the top of the tab.
   */
  it('sends the reader to the backdrop section on the integrations tab', () => {
    const { getByText } = renderWithProviders(<AppearanceTab />);

    fireEvent.click(getByText('Open Backgrounds'));

    expect(navigate).toHaveBeenCalledWith('/settings', {
      state: { tab: 'integrations', focus: 'Backgrounds' },
    });
  });

  it('offers the track list cover and bitrate toggles', () => {
    const { getByRole } = renderWithProviders(<AppearanceTab />);

    expect(getByRole('checkbox', { name: 'Album art in track lists' })).toBeInTheDocument();
    expect(getByRole('checkbox', { name: 'Show Bitrate' })).toBeInTheDocument();
  });
});
