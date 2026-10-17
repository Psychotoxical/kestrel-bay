import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeSubsonicSong } from '@/test/helpers/factories';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { songToTrack } from '@/lib/media/songToTrack';
import { useConfirmModalStore } from '@/store/confirmModalStore';
import { useMeteredNetworkStore } from '@/lib/network/meteredNetwork';
import { useMobileActionSheetStore } from '@/features/mobileShell/store/mobileActionSheetStore';
import AlbumDetailMobile from './AlbumDetailMobile';

const album = {
  id: 'al1',
  name: 'Taken by Storm',
  artist: 'Stormwind',
  artistId: 'ar1',
  year: 1999,
  genre: 'Metal',
  songCount: 3,
  duration: 600,
} as SubsonicAlbum;

function songs() {
  return [
    makeSubsonicSong({ id: 's1', title: 'Chaos', track: 1, albumId: 'al1', artist: 'Stormwind', suffix: 'flac', bitRate: 900, duration: 200 }),
    makeSubsonicSong({ id: 's2', title: 'Rapture', track: 2, albumId: 'al1', artist: 'Stormwind', duration: 200 }),
    makeSubsonicSong({ id: 's3', title: 'Finale', track: 3, albumId: 'al1', artist: 'Stormwind', duration: 200 }),
  ];
}

function setup(overrides: Partial<React.ComponentProps<typeof AlbumDetailMobile>> = {}) {
  const props = {
    info: album,
    serverId: 'srv',
    artistRefs: [{ id: 'ar1', name: 'Stormwind' }],
    songs: songs(),
    coverUrl: null,
    isStarred: false,
    currentTrack: null,
    isPlaying: false,
    relatedAlbums: [],
    relatedTitle: 'More by Stormwind',
    canPinOffline: true,
    offlineStatus: 'none' as const,
    offlineProgress: null,
    onToggleStar: vi.fn(),
    onPlayAll: vi.fn(),
    onShuffleAll: vi.fn(),
    onPlaySong: vi.fn(),
    onCacheOffline: vi.fn(),
    onRemoveOffline: vi.fn(),
    ...overrides,
  };
  renderWithProviders(<AlbumDetailMobile {...props} />, { route: '/album/al1' });
  return props;
}

describe('AlbumDetailMobile', () => {
  beforeEach(() => { resetAllStores(); });

  it('shows title, artist and the meta line', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Taken by Storm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stormwind' })).toBeInTheDocument();
    expect(screen.getByText('Metal · 1999 · FLAC 900 kbps')).toBeInTheDocument();
  });

  it('play and shuffle start the album', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    expect(props.onPlayAll).toHaveBeenCalledTimes(1);
    expect(props.onShuffleAll).toHaveBeenCalledTimes(1);
  });

  it('tapping a track plays it', () => {
    const props = setup();
    fireEvent.click(screen.getByText('Rapture'));
    expect(props.onPlaySong).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }));
  });

  it('a track\'s more button opens its song menu', () => {
    const openContextMenu = vi.fn();
    usePlayerStore.setState({ openContextMenu });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'More options: Finale' }));
    expect(openContextMenu).toHaveBeenCalledWith(
      expect.any(Number), expect.any(Number), songToTrack(songs()[2]), 'album-song',
    );
  });

  it('the header more button opens the album menu', () => {
    const openContextMenu = vi.fn();
    usePlayerStore.setState({ openContextMenu });
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(openContextMenu).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), album, 'album');
  });

  it('marks the playing track', () => {
    setup({ currentTrack: songToTrack(songs()[1]), isPlaying: true });
    const active = screen.getByText('Rapture').closest('li');
    expect(active).toHaveClass('is-active');
    expect(within(active as HTMLElement).getByRole('button', { name: /^Rapture/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Chaos').closest('li')).not.toHaveClass('is-active');
  });

  it('reflects and toggles the favourite state', () => {
    const props = setup({ isStarred: true });
    const heart = screen.getByRole('button', { name: /favorites/i });
    expect(heart).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(heart);
    expect(props.onToggleStar).toHaveBeenCalledTimes(1);
  });

  it('the download button starts the download', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(props.onCacheOffline).toHaveBeenCalledTimes(1);
  });

  it('shows the progress while downloading and ignores taps', () => {
    const props = setup({ offlineStatus: 'downloading', offlineProgress: { done: 3, total: 10 } });
    const button = screen.getByRole('button', { name: 'Downloading… 3 of 10' });
    fireEvent.click(button);
    expect(props.onCacheOffline).not.toHaveBeenCalled();
  });

  it('asks before it removes a download', async () => {
    const props = setup({ offlineStatus: 'cached' });
    fireEvent.click(screen.getByRole('button', { name: 'Downloaded' }));
    expect(useConfirmModalStore.getState()).toMatchObject({
      isOpen: true,
      title: 'Remove download?',
      message: '“Taken by Storm” will no longer be available offline.',
    });
    expect(props.onRemoveOffline).not.toHaveBeenCalled();
    useConfirmModalStore.getState().confirm();
    await vi.waitFor(() => expect(props.onRemoveOffline).toHaveBeenCalledTimes(1));
  });

  it('keeps the download removable offline, but offers no new one there', () => {
    setup({ canPinOffline: false, offlineStatus: 'cached' });
    expect(screen.getByRole('button', { name: 'Downloaded' })).toBeInTheDocument();
  });

  it('hides the download button offline when nothing is downloaded', () => {
    setup({ canPinOffline: false });
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
  });

  it('on mobile data a queued download waits for Wi-Fi and can be cancelled', async () => {
    useMeteredNetworkStore.setState({ metered: true });
    try {
      const props = setup({ offlineStatus: 'queued' });
      fireEvent.click(screen.getByRole('button', { name: 'Waiting for Wi-Fi' }));
      await vi.waitFor(() => expect(useMobileActionSheetStore.getState().isOpen).toBe(true));
      useMobileActionSheetStore.getState().choose('stop');
      await vi.waitFor(() => expect(props.onRemoveOffline).toHaveBeenCalledTimes(1));
    } finally {
      useMeteredNetworkStore.setState({ metered: false });
    }
  });

  it('groups multi-disc albums under disc headings', () => {
    setup({
      songs: [
        makeSubsonicSong({ id: 'd1', title: 'One', track: 1, discNumber: 1, albumId: 'al1' }),
        makeSubsonicSong({ id: 'd2', title: 'Two', track: 1, discNumber: 2, albumId: 'al1' }),
      ],
    });
    expect(screen.getByRole('heading', { name: 'CD 1' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'CD 2' })).toBeInTheDocument();
  });

  it('shows each track\'s artist only on various-artists albums', () => {
    setup({
      songs: [
        makeSubsonicSong({ id: 'v1', title: 'One', track: 1, albumId: 'al1', artist: 'Guest Band' }),
        makeSubsonicSong({ id: 'v2', title: 'Two', track: 2, albumId: 'al1', artist: 'Stormwind' }),
      ],
    });
    expect(screen.getByText('Guest Band')).toBeInTheDocument();
  });
});
