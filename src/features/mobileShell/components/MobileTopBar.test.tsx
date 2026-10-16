import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';

vi.mock('@/features/offline', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline')>()),
  useOfflineBrowseContext: () => ({ active: false }),
}));

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
    useAuthStore.setState({
      servers: [HOME],
      activeServerId: 'home',
      isLoggedIn: true,
      libraryBrowseServerIds: ['home'],
      musicFoldersByServer: { home: [{ id: 'music', name: 'Music' }] },
    });
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
    expect(chip()).toHaveTextContent('2 servers');
  });

  it('a library filter shows on the chip', () => {
    useAuthStore.setState({
      musicFoldersByServer: { home: [{ id: 'music', name: 'Music' }, { id: 'books', name: 'Books' }] },
      libraryBrowseSelectionByServer: { home: ['books'] },
    });
    renderHeader();
    expect(screen.getByLabelText('Library scope')).toBeInTheDocument();
  });
});
