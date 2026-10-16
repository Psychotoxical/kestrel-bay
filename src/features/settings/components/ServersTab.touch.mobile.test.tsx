import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { serverIndexKeyForProfile } from '@/lib/server/serverIndexKey';

const mocks = vi.hoisted(() => ({
  switchActiveServer: vi.fn(),
  ensureConnectUrlResolved: vi.fn(),
  runServerAction: vi.fn(),
  handleCancel: vi.fn(),
}));

vi.mock('@/lib/library/hooks/useLibraryIndexSync', () => ({
  useLibraryIndexSync: () => ({
    statusByServer: {}, connectionByServer: {}, progressByServer: {}, busyServerId: null,
    bootstrapping: false, globalBusy: false,
    runServerAction: mocks.runServerAction, handleCancel: mocks.handleCancel,
  }),
}));
vi.mock('@/utils/server/switchActiveServer', () => ({ switchActiveServer: mocks.switchActiveServer }));
vi.mock('@/lib/server/serverEndpoint', () => ({
  admitSuccessfulPingForProfile: vi.fn(),
  ensureConnectUrlResolved: mocks.ensureConnectUrlResolved,
  invalidateReachableEndpointCache: vi.fn(),
  allNormalizedAddresses: (srv: { url: string }) => [srv.url],
  profileProbeFingerprint: (profile: { url: string }) => profile.url,
}));
vi.mock('@/lib/api/subsonic', () => ({
  pingWithCredentialsForProfile: vi.fn(),
  scheduleInstantMixProbeForServer: vi.fn(),
}));
vi.mock('@/lib/server/syncServerHttpContext', () => ({
  clearServerHttpContext: vi.fn(),
  setServerHttpContextIdentitySource: vi.fn(),
  syncAllServerHttpContexts: vi.fn(),
  syncServerHttpContextForProfile: vi.fn(),
}));
vi.mock('@/lib/dom/toast', () => ({ showToast: vi.fn() }));
vi.mock('@/lib/serverCapabilities/storeView', () => ({
  isFeatureActiveForServer: () => false,
  resolveFeatureForServer: () => null,
}));
vi.mock('@/features/settings/components/AddServerForm', () => ({
  AddServerForm: ({ editingServer, onCancel }: { editingServer?: { name: string }; onCancel: () => void }) => (
    <div>
      <span>{editingServer ? `form for ${editingServer.name}` : 'empty form'}</span>
      <button type="button" onClick={onCancel}>form-cancel</button>
    </div>
  ),
}));

import { ServersTab } from './ServersTab';

const HOME = { id: 'home', name: 'Home', url: 'https://music.example.org', username: 'frank', password: 'p' };
const ASRA = { id: 'asra', name: 'Asra', url: 'https://asra.example.net', username: 'guest', password: 'p' };

function renderTab() {
  return renderWithProviders(<ServersTab initialInvite={null} />, { route: '/settings' });
}

const row = (name: string) => screen.getByText(name).closest<HTMLElement>('[data-reorder-id]')!;

describe('ServersTab (touch shell)', () => {
  beforeEach(() => {
    resetAuthStore();
    Object.values(mocks).forEach(mock => mock.mockReset());
    useAuthStore.setState({ servers: [HOME, ASRA], activeServerId: 'home', isLoggedIn: true });
  });

  it('lists one row per server, marks the active one, and drops the desktop cards', () => {
    const view = renderTab();
    expect(row('Home')).toHaveTextContent('frank@music.example.org');
    expect(within(row('Home')).getByText('Active')).toBeInTheDocument();
    expect(within(row('Asra')).queryByText('Active')).toBeNull();
    expect(view.container.querySelector('#settings-add-server-btn')).toBeNull();
    expect(view.container.querySelector('.sidebar-customizer-grip')).toBeNull();
  });

  it('a server row opens its sheet; Use switches to that server', async () => {
    mocks.switchActiveServer.mockResolvedValue(true);
    renderTab();
    fireEvent.click(row('Asra'));
    const sheet = screen.getByRole('dialog', { name: 'Asra' });
    expect(within(sheet).getByText('guest@asra.example.net')).toBeInTheDocument();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Use' }));
    await waitFor(() => expect(mocks.switchActiveServer).toHaveBeenCalledWith(ASRA));
  });

  it('the active server says so instead of offering Use', () => {
    renderTab();
    fireEvent.click(row('Home'));
    const sheet = screen.getByRole('dialog', { name: 'Home' });
    expect(within(sheet).queryByRole('button', { name: 'Use' })).toBeNull();
    expect(within(sheet).getByText('Active')).toBeInTheDocument();
  });

  it('Test Connection probes the server and shows when it fails', async () => {
    mocks.ensureConnectUrlResolved.mockResolvedValue({ ok: false });
    renderTab();
    fireEvent.click(row('Asra'));
    const sheet = screen.getByRole('dialog', { name: 'Asra' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Test Connection' }));
    await waitFor(() => expect(sheet.querySelector('.server-touch__error')).not.toBeNull());
    expect(mocks.ensureConnectUrlResolved).toHaveBeenCalledWith(ASRA);
  });

  it('the index actions run for that server', () => {
    renderTab();
    fireEvent.click(row('Asra'));
    const sheet = screen.getByRole('dialog', { name: 'Asra' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Full resync' }));
    fireEvent.click(within(sheet).getByRole('button', { name: 'Verify library integrity' }));
    const key = serverIndexKeyForProfile(ASRA);
    expect(mocks.runServerAction).toHaveBeenNthCalledWith(1, key, 'full');
    expect(mocks.runServerAction).toHaveBeenNthCalledWith(2, key, 'verify');
  });

  it('Edit swaps the server sheet for the form sheet; cancel closes it', () => {
    renderTab();
    fireEvent.click(row('Asra'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Asra' })).getByRole('button', { name: 'Edit Server' }));
    expect(screen.queryByRole('dialog', { name: 'Asra' })).toBeNull();
    const form = screen.getByRole('dialog', { name: 'Edit Server' });
    expect(within(form).getByText('form for Asra')).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'form-cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Edit Server' })).toBeNull();
  });

  it('Add Server opens the empty form in a sheet', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Add Server' }));
    expect(within(screen.getByRole('dialog', { name: 'Add New Server' })).getByText('empty form')).toBeInTheDocument();
  });

  it('Logout signs out', () => {
    renderTab();
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(useAuthStore.getState().isLoggedIn).toBe(false);
  });
});
