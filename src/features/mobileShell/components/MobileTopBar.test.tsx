import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { useDevOfflineBrowseStore } from '@/store/devOfflineBrowseStore';

const offline = vi.hoisted(() => ({ active: false }));

vi.mock('@/features/offline', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline')>()),
  useOfflineBrowseContext: () => ({ active: false }),
  useOfflineBrowseActive: () => offline.active,
}));

vi.mock('@/lib/api/subsonicScrobble', () => ({ getNowPlayingForServers: vi.fn(async () => []) }));

import MobileTopBar from './MobileTopBar';

const HOME = { id: 'home', name: 'Home', url: 'https://music.example.org', username: 'frank', password: 'p' };
const ASRA = { id: 'asra', name: 'Asra', url: 'https://asra.example.net', username: 'guest', password: 'p' };

function Location() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname} ${JSON.stringify(location.state)}`}</output>;
}

function renderHeader() {
  return renderWithProviders(
    <><MobileTopBar serverName="Home" connStatus="connected" isLan={false} /><Location /></>,
    { route: '/' },
  );
}

const chip = () => screen.getByRole('button', { name: /Home|servers/ });

describe('MobileTopBar server chip', () => {
  beforeEach(() => {
    resetAuthStore();
    useDevOfflineBrowseStore.setState({ forceOffline: false });
    offline.active = false;
    useAuthStore.setState({
      servers: [HOME],
      activeServerId: 'home',
      isLoggedIn: true,
      libraryBrowseServerIds: ['home'],
      musicFoldersByServer: { home: [{ id: 'music', name: 'Music' }] },
    });
  });

  it('shows symbols only; the server name is the chip\'s label', () => {
    renderHeader();
    expect(chip()).toHaveAccessibleName('Home');
    expect(chip().textContent).toBe('');
    expect(chip().querySelector('.mobile-status-dot')).not.toBeNull();
  });

  it('one server with one library: the chip leads to the server settings, as on desktop', () => {
    renderHeader();
    expect(chip()).not.toHaveAttribute('aria-haspopup');
    fireEvent.click(chip());
    expect(screen.getByTestId('location')).toHaveTextContent('/settings {"tab":"servers"}');
  });

  it('with something to choose, the chip opens the scope sheet', () => {
    useAuthStore.setState({ servers: [HOME, ASRA] });
    renderHeader();
    fireEvent.click(chip());
    expect(screen.getByRole('dialog', { name: 'Library scope' })).toBeInTheDocument();
  });

  it('several servers in the scope: the chip counts them, like the desktop', () => {
    useAuthStore.setState({ servers: [HOME, ASRA], libraryBrowseServerIds: ['home', 'asra'] });
    renderHeader();
    expect(chip()).toHaveAccessibleName('2 servers');
  });

  it('the Live button sits right before the account button', () => {
    renderHeader();
    const live = screen.getByRole('button', { name: 'Who is listening?' });
    const account = screen.getByRole('button', { name: /Servers · Settings/ });
    expect(live.nextElementSibling).toBe(account);
  });

  it('a library filter shows on the chip', () => {
    useAuthStore.setState({
      musicFoldersByServer: { home: [{ id: 'music', name: 'Music' }, { id: 'books', name: 'Books' }] },
      libraryBrowseSelectionByServer: { home: ['books'] },
    });
    renderHeader();
    expect(screen.getByLabelText('Library scope')).toBeInTheDocument();
  });

  it('offline the mix and Most Played cards give way: both need the server', () => {
    const { unmount } = renderHeader();
    expect(screen.getByRole('button', { name: 'Build a Mix' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Most Played' })).toBeInTheDocument();
    unmount();

    offline.active = true;
    renderHeader();
    expect(screen.queryByRole('button', { name: 'Build a Mix' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Most Played' })).not.toBeInTheDocument();
  });

  it('"downloaded music only": the chip says Offline and leads to the switch', () => {
    useDevOfflineBrowseStore.setState({ forceOffline: true });
    renderHeader();
    const offlineChip = screen.getByRole('button', { name: 'Offline' });
    fireEvent.click(offlineChip);
    const sw = screen.getByRole('switch', { name: 'Downloaded music only' });
    expect(sw).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(sw);
    expect(useDevOfflineBrowseStore.getState().forceOffline).toBe(false);
    expect(screen.queryByRole('button', { name: 'Offline' })).not.toBeInTheDocument();
  });
});
