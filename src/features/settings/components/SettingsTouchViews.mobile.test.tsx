import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import type { ServerProfile } from '@/store/authStoreTypes';
import { useMobileActionSheetStore } from '@/features/mobileShell/store/mobileActionSheetStore';
import type { NdLibrary, NdUser } from '@/lib/api/navidromeAdmin';
import i18n from '@/lib/i18n';
import { StreamQualityTouchSection } from './audio/StreamQualityTouchSection';
import { UserMgmtTouchView } from './userMgmt/UserMgmtTouchView';

const server: ServerProfile = {
  id: 'srv',
  name: 'Home',
  url: 'https://music.example.com',
  alternateUrl: 'http://192.168.1.10:4533',
  username: 'frank',
  password: 'x',
};

beforeEach(() => {
  resetAllStores();
  useMobileActionSheetStore.setState({ isOpen: false });
  useAuthStore.setState({
    servers: [server],
    activeServerId: 'srv',
    subsonicServerIdentityByServer: { srv: { type: 'navidrome', serverVersion: '0.58.0', openSubsonic: true } },
    streamQualityByAddress: {},
    streamFormatByAddress: {},
  });
});

describe('StreamQualityTouchSection', () => {
  it('lists both addresses of the active server and writes the chosen cap and format', async () => {
    renderWithProviders(<StreamQualityTouchSection t={i18n.t} />);
    expect(screen.getByText('Internet')).toBeInTheDocument();
    expect(screen.getByText('Home network')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Internet'));
    await vi.waitFor(() => expect(useMobileActionSheetStore.getState().isOpen).toBe(true));
    useMobileActionSheetStore.getState().choose('128');
    await vi.waitFor(() => expect(useMobileActionSheetStore.getState().title).toBe('Transcode format'));
    useMobileActionSheetStore.getState().choose('opus');

    await vi.waitFor(() => expect(useAuthStore.getState().streamFormatByAddress).toEqual({
      'https://music.example.com': 'opus',
    }));
    expect(useAuthStore.getState().streamQualityByAddress).toEqual({ 'https://music.example.com': 128 });
    expect(await screen.findByText('128 kbps · OPUS')).toBeInTheDocument();
  });

  it('asks no format when the cap is Original', async () => {
    useAuthStore.setState({ streamQualityByAddress: { 'https://music.example.com': 192 } });
    renderWithProviders(<StreamQualityTouchSection t={i18n.t} />);
    fireEvent.click(screen.getByText('Internet'));
    await vi.waitFor(() => expect(useMobileActionSheetStore.getState().isOpen).toBe(true));
    useMobileActionSheetStore.getState().choose('0');
    await vi.waitFor(() => expect(useAuthStore.getState().streamQualityByAddress).toEqual({}));
    expect(useMobileActionSheetStore.getState().isOpen).toBe(false);
  });

  it('stays read-only on servers that are not Navidrome', () => {
    useAuthStore.setState({ subsonicServerIdentityByServer: {} });
    renderWithProviders(<StreamQualityTouchSection t={i18n.t} />);
    expect(screen.getByText('Only available on Navidrome servers.')).toBeInTheDocument();
    expect(screen.getByText('Internet').closest('button')).toBeDisabled();
  });
});

describe('UserMgmtTouchView', () => {
  const libraries: NdLibrary[] = [{ id: 1, name: 'Music' }, { id: 2, name: 'Audiobooks' }];
  const users: NdUser[] = [
    { id: 'u1', userName: 'frank', name: 'Frank', email: '', isAdmin: true, libraryIds: [] },
    { id: 'u2', userName: 'kim', name: 'Kim', email: '', isAdmin: false, libraryIds: [2] },
  ];
  const renderView = () => {
    const props = {
      users, libraries, currentUsername: 'frank', busy: false,
      onAdd: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onRequestMagic: vi.fn(),
    };
    renderWithProviders(<UserMgmtTouchView {...props} t={i18n.t} i18n={i18n} />);
    return props;
  };

  it('opens a user sheet with libraries and deletes after confirming', async () => {
    const props = renderView();
    expect(screen.getByText('You')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Kim'));
    expect(await screen.findByText('Audiobooks')).toBeInTheDocument();
    expect(screen.queryByText('Music')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Delete user'));
    await vi.waitFor(() => expect(useMobileActionSheetStore.getState().isOpen).toBe(true));
    useMobileActionSheetStore.getState().choose('delete');
    await vi.waitFor(() => expect(props.onDelete).toHaveBeenCalledWith(users[1]));
  });

  it('offers no delete for the signed-in user and no magic string for admins', async () => {
    renderView();
    fireEvent.click(screen.getByText('Frank'));
    expect(await screen.findByText('Admin users automatically have access to all libraries.')).toBeInTheDocument();
    expect(screen.queryByText('Delete user')).not.toBeInTheDocument();
    expect(screen.queryByText('Generate magic string')).not.toBeInTheDocument();
  });
});
