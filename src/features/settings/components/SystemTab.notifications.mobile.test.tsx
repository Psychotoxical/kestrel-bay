import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { SystemTab } from './SystemTab';

vi.mock('@/lib/api/platformShell', () => ({
  linuxWaylandTextRenderSettingsAvailable: vi.fn(async () => false),
}));

vi.mock('@/lib/themes/themeRegistry', () => ({
  revalidateRegistry: vi.fn(async () => undefined),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(async () => null),
}));

describe('SystemTab notification settings (touch shell)', () => {
  beforeEach(resetAuthStore);

  it('leaves out the track change notification toggle: iOS shows no desktop notifications', () => {
    renderWithProviders(<SystemTab />);

    expect(screen.queryByRole('checkbox', { name: 'Notify on Track Change' })).not.toBeInTheDocument();
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  });
});
