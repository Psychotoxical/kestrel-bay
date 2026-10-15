/**
 * `QueuePanel` touch layout (mobile queue sheet): touch header with the
 * actions menu, playback chips and mode switch instead of the desktop header,
 * toolbar and tab bar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/subsonic', () => ({
  savePlayQueue: vi.fn(async () => undefined),
  getPlayQueue: vi.fn(async () => ({ songs: [], current: undefined, position: 0 })),
  buildStreamUrl: vi.fn((id: string) => `https://mock/stream/${id}`),
  buildCoverArtUrl: vi.fn((id: string) => `https://mock/cover/${id}`),
  buildDownloadUrl: vi.fn((id: string) => `https://mock/download/${id}`),
  coverArtCacheKey: vi.fn((id: string, size = 256) => `mock:cover:${id}:${size}`),
  getSong: vi.fn(async () => null),
  getRandomSongs: vi.fn(async () => []),
  getSimilarSongs2: vi.fn(async () => []),
  getTopSongs: vi.fn(async () => []),
  getAlbumInfo2: vi.fn(async () => null),
  reportNowPlaying: vi.fn(async () => undefined),
  scrobbleSong: vi.fn(async () => undefined),
}));

vi.mock('@/features/orbit/utils/orbitBulkGuard', () => ({
  orbitBulkGuard: vi.fn(async () => true),
}));

import QueuePanel from '@/features/queue/components/QueuePanel';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { useAuthStore } from '@/store/authStore';
import { usePlaylistStore } from '@/features/playlist';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeTrack, seedQueue } from '@/test/helpers/factories';
import { onInvoke, registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';

let offsetSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetAllStores();
  const id = useAuthStore.getState().addServer({
    name: 'T', url: 'https://x.test', username: 'u', password: 'p',
  });
  useAuthStore.getState().setActiveServer(id);
  usePlaylistStore.setState({ playlists: [], playlistsLoading: false, recentIds: [], lastModified: {} });
  registerDefaultCoverInvokeHandlers();
  onInvoke('audio_play', () => undefined);
  onInvoke('audio_pause', () => undefined);
  onInvoke('audio_stop', () => undefined);
  onInvoke('audio_seek', () => undefined);
  onInvoke('audio_get_state', () => ({ playing: false }));
  onInvoke('audio_update_replay_gain', () => undefined);
  onInvoke('discord_update_presence', () => undefined);
  onInvoke('library_get_recent_play_sessions', () => []);
  // jsdom has no layout; give the virtualized list a viewport (see QueuePanel.test).
  offsetSpy = vi
    .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('queue-list') ? 600 : 52;
    });
});
afterEach(() => offsetSpy.mockRestore());

function seedThree() {
  const tracks = [
    makeTrack({ id: 't1', title: 'First' }),
    makeTrack({ id: 't2', title: 'Second' }),
    makeTrack({ id: 't3', title: 'Third' }),
  ];
  seedQueue(tracks, { index: 0, currentTrack: tracks[0] });
  return tracks;
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'More options' }));
  return screen.getByRole('menu');
}

describe('QueuePanel touch layout', () => {
  it('swaps the desktop header, toolbar and tab bar for the touch header', () => {
    seedThree();
    const { container } = renderWithProviders(<QueuePanel touch onClose={() => {}} />);
    expect(container.querySelector('.queue-touch-header')).not.toBeNull();
    expect(container.querySelector('.queue-header')).toBeNull();
    expect(container.querySelector('.queue-toolbar')).toBeNull();
    expect(container.querySelector('.queue-tab-bar')).toBeNull();
  });

  it('keeps the desktop layout without the touch flag', () => {
    seedThree();
    const { container } = renderWithProviders(<QueuePanel />);
    expect(container.querySelector('.queue-touch-header')).toBeNull();
    expect(container.querySelector('.queue-header')).not.toBeNull();
  });

  it('queue mode shows the current track above the upcoming ones', () => {
    seedThree();
    useAuthStore.getState().setQueueDisplayMode('queue');
    const { container } = renderWithProviders(<QueuePanel touch />);
    expect(container.querySelector('.queue-touch-now')).toHaveTextContent('First');
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('the mode switch sets queue / playlist / timeline', () => {
    seedThree();
    renderWithProviders(<QueuePanel touch />);
    fireEvent.click(screen.getByRole('tab', { name: 'Playlist' }));
    expect(useAuthStore.getState().queueDisplayMode).toBe('playlist');
    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(useAuthStore.getState().queueDisplayMode).toBe('timeline');
    expect(screen.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
  });

  it('the close button closes the sheet', () => {
    const onClose = vi.fn();
    renderWithProviders(<QueuePanel touch onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('menu: shuffle toggles the persistent shuffle mode', () => {
    seedThree();
    renderWithProviders(<QueuePanel touch />);
    const before = usePlayerStore.getState().shuffleMode;
    openMenu();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Shuffle queue' }));
    expect(usePlayerStore.getState().shuffleMode).toBe(!before);
  });

  it('menu: clear empties the queue and closes the menu', () => {
    seedThree();
    renderWithProviders(<QueuePanel touch />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear queue' }));
    expect(usePlayerStore.getState().queueItems).toHaveLength(0);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('menu: load playlist opens the playlist picker', () => {
    seedThree();
    renderWithProviders(<QueuePanel touch />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Load Playlist' }));
    expect(screen.getByRole('heading', { name: 'Load Playlist' })).toBeInTheDocument();
  });

  it('the infinite-queue chip toggles infinite queue', () => {
    renderWithProviders(<QueuePanel touch />);
    const before = useAuthStore.getState().infiniteQueueEnabled;
    fireEvent.click(screen.getByRole('button', { name: /Infinite/ }));
    expect(useAuthStore.getState().infiniteQueueEnabled).toBe(!before);
  });
});
