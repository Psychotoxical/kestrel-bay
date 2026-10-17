import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeSubsonicSong } from '@/test/helpers/factories';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/features/playback/store/playerStore';

const mocks = vi.hoisted(() => ({ fetchPage: vi.fn() }));

vi.mock('@/features/offline', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline')>()),
  fetchOfflineLocalBrowsableSongPage: mocks.fetchPage,
}));
// The virtualiser draws no rows without layout; a plain list stands in.
vi.mock('@/features/mobileShell', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/mobileShell')>()),
  MobileVirtualSongList: ({ songs, onPlay }: { songs: SubsonicSong[]; onPlay: (i: number) => void }) => (
    <ol>{songs.map((s, i) => <li key={s.id}><button type="button" onClick={() => onPlay(i)}>{s.title}</button></li>)}</ol>
  ),
}));

import TracksOfflineTouch from './TracksOfflineTouch';

const SONGS = [
  makeSubsonicSong({ id: 's1', title: 'Gestein Teil 1', serverId: 'srv' }),
  makeSubsonicSong({ id: 's2', title: 'Hagel Teil 1', serverId: 'srv' }),
];

describe('Tracks offline in the touch shell', () => {
  beforeEach(() => {
    resetAllStores();
    useAuthStore.setState({ activeServerId: 'srv' });
    mocks.fetchPage.mockReset().mockResolvedValue({ songs: SONGS, hasMore: false });
  });

  it('lists the songs on the device; tapping one plays the list from there', async () => {
    const playTrack = vi.fn();
    usePlayerStore.setState({ playTrack });
    renderWithProviders(<TracksOfflineTouch />);
    fireEvent.click(await screen.findByRole('button', { name: 'Hagel Teil 1' }));
    expect(playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's2' }),
      [expect.objectContaining({ id: 's1' }), expect.objectContaining({ id: 's2' })],
    );
  });

  it('play starts at the first song, shuffle plays all of them', async () => {
    const playTrack = vi.fn();
    usePlayerStore.setState({ playTrack });
    renderWithProviders(<TracksOfflineTouch />);
    fireEvent.click(await screen.findByRole('button', { name: /^Play$/ }));
    expect(playTrack).toHaveBeenLastCalledWith(expect.objectContaining({ id: 's1' }), expect.any(Array));
    fireEvent.click(screen.getByRole('button', { name: /Shuffle/ }));
    expect(playTrack.mock.lastCall?.[1]).toHaveLength(2);
  });

  it('with nothing on the device it says so', async () => {
    mocks.fetchPage.mockResolvedValue({ songs: [], hasMore: false });
    renderWithProviders(<TracksOfflineTouch />);
    expect(await screen.findByText(/Nothing downloaded yet/)).toBeInTheDocument();
  });
});
