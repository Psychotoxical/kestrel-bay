import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';

const mocks = vi.hoisted(() => ({
  switchActiveServer: vi.fn(),
  showToast: vi.fn(),
  offline: false,
}));
vi.mock('@/utils/server/switchActiveServer', () => ({ switchActiveServer: mocks.switchActiveServer }));
vi.mock('@/lib/dom/toast', () => ({ showToast: mocks.showToast }));
vi.mock('@/features/offline', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline')>()),
  useOfflineBrowseContext: () => ({ active: mocks.offline }),
}));

import MobileSourceSheet from './MobileSourceSheet';

const HOME = { id: 'home', name: 'Home', url: 'https://music.example.org', username: 'frank', password: 'p' };
const ASRA = { id: 'asra', name: 'Asra', url: 'https://asra.example.net', username: 'guest', password: 'p' };
const MUSIC = { id: 'music', name: 'Music' };
const BOOKS = { id: 'books', name: 'Audiobooks' };
const LIVE = { id: 'live', name: 'Live' };

function Location() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname} ${JSON.stringify(location.state)}`}</output>;
}

function renderSheet() {
  const onClose = vi.fn();
  renderWithProviders(<><MobileSourceSheet onClose={onClose} /><Location /></>, { route: '/albums' });
  return onClose;
}

const sheet = () => screen.getByRole('dialog', { name: 'Library scope' });
const serverSection = () => within(sheet()).getByRole('heading', { name: 'Servers' }).closest('section')!;
const scope = () => useAuthStore.getState().libraryBrowseServerIds;
const librarySelection = (serverId: string) => useAuthStore.getState().libraryBrowseSelectionByServer[serverId] ?? [];

describe('MobileSourceSheet', () => {
  beforeEach(() => {
    resetAuthStore();
    mocks.switchActiveServer.mockReset();
    mocks.showToast.mockReset();
    mocks.offline = false;
    useAuthStore.setState({
      servers: [HOME, ASRA],
      activeServerId: 'home',
      isLoggedIn: true,
      libraryBrowseServerIds: ['home'],
      musicFoldersByServer: { home: [MUSIC, BOOKS, LIVE], asra: [] },
    });
  });

  it('lists the saved servers; the round check adds one to the scope', () => {
    renderSheet();
    const section = serverSection();
    expect(within(section).getByRole('button', { name: /^Home/ })).toHaveTextContent('Active');
    fireEvent.click(within(section).getByRole('button', { name: /Include Asra/ }));
    expect(scope()).toEqual(expect.arrayContaining(['home', 'asra']));
  });

  it('the last server in the scope cannot be taken out', () => {
    renderSheet();
    expect(within(serverSection()).getByRole('button', { name: /Exclude Home/ })).toBeDisabled();
  });

  it('tapping the active server browses only it and closes', () => {
    useAuthStore.setState({ libraryBrowseServerIds: ['home', 'asra'] });
    const onClose = renderSheet();
    fireEvent.click(within(serverSection()).getByRole('button', { name: /^Home/ }));
    expect(scope()).toEqual(['home']);
    expect(onClose).toHaveBeenCalled();
    expect(mocks.switchActiveServer).not.toHaveBeenCalled();
  });

  it('tapping another server switches to it, browses only it and goes to Mainstage', async () => {
    mocks.switchActiveServer.mockImplementation(async () => {
      useAuthStore.setState({ activeServerId: 'asra' });
      return true;
    });
    const onClose = renderSheet();
    fireEvent.click(within(serverSection()).getByRole('button', { name: /^Asra/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.switchActiveServer).toHaveBeenCalledWith(ASRA);
    expect(scope()).toEqual(['asra']);
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/ /));
  });

  it('a failed switch keeps the sheet open and says so', async () => {
    mocks.switchActiveServer.mockResolvedValue(false);
    const onClose = renderSheet();
    fireEvent.click(within(serverSection()).getByRole('button', { name: /^Asra/ }));
    await waitFor(() => expect(mocks.showToast).toHaveBeenCalledWith('Could not switch — server unreachable.', 5000, 'error'));
    expect(onClose).not.toHaveBeenCalled();
    expect(scope()).toEqual(['home']);
  });

  it('libraries: all by default; the check narrows, tapping a name picks only it and closes', async () => {
    const onClose = renderSheet();
    const libraries = within(sheet()).getByRole('heading', { name: 'Library' }).closest('section')!;
    expect(within(libraries).getByRole('button', { name: 'All libraries' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(within(libraries).getByRole('button', { name: /Include Audiobooks/ }));
    expect(librarySelection('home')).toEqual(['books']);
    fireEvent.click(within(libraries).getByRole('button', { name: /Include Music/ }));
    expect([...librarySelection('home')].sort()).toEqual(['books', 'music']);
    fireEvent.click(within(libraries).getByRole('button', { name: /Exclude Audiobooks/ }));
    expect(librarySelection('home')).toEqual(['music']);
    fireEvent.click(within(libraries).getByRole('button', { name: 'All libraries' }));
    expect(librarySelection('home')).toEqual([]);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(within(libraries).getByRole('button', { name: 'Music' }));
    expect(onClose).toHaveBeenCalled();
    await act(async () => { await new Promise(resolve => requestAnimationFrame(() => resolve(null))); });
    expect(librarySelection('home')).toEqual(['music']);
  });

  it('with several servers in the scope, each one gets its own library list', () => {
    useAuthStore.setState({
      libraryBrowseServerIds: ['home', 'asra'],
      musicFoldersByServer: { home: [MUSIC], asra: [{ id: 'jazz', name: 'Jazz' }] },
    });
    renderSheet();
    expect(within(sheet()).getByRole('heading', { name: 'Library · Home' })).toBeInTheDocument();
    expect(within(sheet()).getByRole('heading', { name: 'Library · Asra' })).toBeInTheDocument();
  });

  it('offline: no library choice', () => {
    mocks.offline = true;
    renderSheet();
    expect(within(sheet()).queryByRole('heading', { name: 'Library' })).toBeNull();
  });

  it('one saved server: only the libraries', () => {
    useAuthStore.setState({ servers: [HOME] });
    renderSheet();
    expect(within(sheet()).queryByRole('heading', { name: 'Servers' })).toBeNull();
    expect(within(sheet()).getByRole('heading', { name: 'Library' })).toBeInTheDocument();
  });

  it('Manage servers opens the server settings', () => {
    const onClose = renderSheet();
    fireEvent.click(within(sheet()).getByRole('button', { name: /Manage servers/ }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId('location')).toHaveTextContent('/settings {"tab":"servers"}');
  });
});
