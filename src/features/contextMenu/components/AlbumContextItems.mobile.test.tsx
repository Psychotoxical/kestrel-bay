/**
 * The album menu in the touch shell: no ZIP download (a phone has no folder to
 * save one to), a download row instead, with the album page's states.
 */
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubsonicAlbum, SubsonicSong } from '@/lib/api/subsonicTypes';
import {
  offlineActionPolicy, useMeteredAllowanceStore, useOfflineJobStore, useOfflineStore,
} from '@/features/offline';
import { useMeteredNetworkStore } from '@/lib/network/meteredNetwork';
import { useMobileActionSheetStore } from '@/features/mobileShell/store/mobileActionSheetStore';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import type { ContextMenuItemsProps } from './contextMenuItemTypes';
import AlbumContextItems from './AlbumContextItems';

vi.mock('@/features/contextMenu/hooks/useBurnMenuAvailable', () => ({
  useBurnMenuAvailable: () => ({ available: false, busy: false }),
}));

const resolveAlbum = vi.hoisted(() => vi.fn());
vi.mock('@/features/offline', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline')>()),
  resolveAlbum: (...args: unknown[]) => resolveAlbum(...args),
  resolveMediaServerId: (serverId?: string | null) => serverId ?? 'srv',
}));

const album = {
  id: 'al-1', name: 'Album', artist: 'Artist', artistId: 'ar-1', serverId: 'srv', songCount: 1, duration: 180,
} as SubsonicAlbum;
const songs = [{ id: 't1', title: 'One', albumId: 'al-1', duration: 180 } as SubsonicSong];

function renderMenu(route?: string) {
  const props = {
    type: 'album',
    item: album,
    userRatingOverrides: {},
    setStarredOverride: vi.fn(),
    setKeyboardRating: vi.fn(),
    keyboardRating: null,
    closeContextMenu: vi.fn(),
    activeSubmenuId: null,
    setActiveSubmenuId: vi.fn(),
    cancelPlaylistSubmenuCloseTimer: vi.fn(),
    onPlaylistSubmenuTriggerMouseLeave: vi.fn(),
    entityRatingSupport: 'full',
    handleAction: (action: () => void | Promise<void>) => Promise.resolve(action()),
    isStarred: () => false,
    pinToPlaybackServer: false,
    offlinePolicy: offlineActionPolicy('contextMenuAlbum', false),
    playNext: vi.fn(),
    enqueue: vi.fn(),
    downloadAlbum: vi.fn(),
    applyAlbumRating: vi.fn(),
    navigateLibrary: vi.fn(),
  } as unknown as ContextMenuItemsProps;
  renderWithProviders(<AlbumContextItems {...props} />, route ? { route } : undefined);
  return props;
}

describe('album menu in the touch shell', () => {
  const downloadAlbum = vi.fn(async () => {});

  beforeEach(() => {
    resolveAlbum.mockResolvedValue({ album, songs });
    downloadAlbum.mockClear();
    useOfflineStore.setState({ downloadAlbum });
    useOfflineJobStore.setState({ jobs: [], pinQueue: [], bulkProgress: {} });
  });

  afterEach(() => {
    useMeteredNetworkStore.setState({ metered: false });
    useMeteredAllowanceStore.setState({ keys: new Set() });
    useMobileActionSheetStore.setState({ isOpen: false });
  });

  it('offers a download instead of the ZIP', async () => {
    const props = renderMenu();
    expect(screen.queryByText('Download (ZIP)')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Download'));
    await vi.waitFor(() => expect(downloadAlbum).toHaveBeenCalledWith(
      'al-1', 'Album', 'Artist', undefined, undefined, songs, 'srv',
    ));
    expect(props.downloadAlbum).not.toHaveBeenCalled();
  });

  it('asks on mobile data before it downloads', async () => {
    useMeteredNetworkStore.setState({ metered: true });
    renderMenu();
    fireEvent.click(screen.getByText('Download'));
    await vi.waitFor(() => expect(useMobileActionSheetStore.getState().isOpen).toBe(true));
    expect(downloadAlbum).not.toHaveBeenCalled();
    useMobileActionSheetStore.getState().choose('cellular');
    await vi.waitFor(() => expect(downloadAlbum).toHaveBeenCalledTimes(1));
  });

  it('shows a download that waits for Wi-Fi', () => {
    useMeteredNetworkStore.setState({ metered: true });
    useOfflineJobStore.setState({
      pinQueue: [{ albumId: 'al-1', albumName: 'Album', pinKind: 'album', status: 'queued', queuedAt: 1, serverId: 'srv' }],
    });
    renderMenu();
    expect(screen.getByText('Waiting for Wi-Fi')).toBeInTheDocument();
  });

  it('offers "Open Album" away from the album page', () => {
    renderMenu('/albums');
    expect(screen.getByText('Open Album')).toBeInTheDocument();
  });

  it('leaves out "Open Album" on the album page itself', () => {
    renderMenu('/album/al-1');
    expect(screen.queryByText('Open Album')).not.toBeInTheDocument();
    expect(screen.getByText('Go to Artist')).toBeInTheDocument();
  });
});
