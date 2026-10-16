import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeSubsonicSong } from '@/test/helpers/factories';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { songToTrack } from '@/lib/media/songToTrack';
import ArtistDetailTopTracks from './ArtistDetailTopTracks';

const songs = [
  makeSubsonicSong({ id: 't1', title: 'Once There Was', album: 'Mount Arreat', duration: 347 }),
  makeSubsonicSong({ id: 't2', title: 'Nihlathak', album: 'Mount Arreat', duration: 315 }),
];

describe('ArtistDetailTopTracks in the touch shell', () => {
  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
  });

  it('renders touch rows: rank, title, album, duration — no desktop table', () => {
    const { container } = renderWithProviders(
      <ArtistDetailTopTracks topSongs={songs} albums={[]} playTopSongWithContinuation={vi.fn(async () => {})} />,
    );
    expect(container.querySelector('.tracklist-header')).toBeNull();
    expect(container.querySelectorAll('.mobile-track')).toHaveLength(2);
    expect(screen.getByText('Nihlathak')).toBeInTheDocument();
    expect(screen.getAllByText('Mount Arreat')).toHaveLength(2);
    expect(screen.getByText('5:15')).toBeInTheDocument();
  });

  it('tapping a row plays from that rank', () => {
    const play = vi.fn(async () => {});
    renderWithProviders(<ArtistDetailTopTracks topSongs={songs} albums={[]} playTopSongWithContinuation={play} />);
    fireEvent.click(screen.getByText('Nihlathak'));
    expect(play).toHaveBeenCalledWith(1);
  });

  it('the more button opens the song menu', () => {
    const openContextMenu = vi.fn();
    usePlayerStore.setState({ openContextMenu });
    renderWithProviders(
      <ArtistDetailTopTracks topSongs={songs} albums={[]} playTopSongWithContinuation={vi.fn(async () => {})} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More options: Once There Was' }));
    expect(openContextMenu).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), songToTrack(songs[0]), 'song');
  });
});
