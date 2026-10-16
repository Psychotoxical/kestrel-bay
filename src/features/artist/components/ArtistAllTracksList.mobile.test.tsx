import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeSubsonicSong } from '@/test/helpers/factories';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { APP_MAIN_SCROLL_VIEWPORT_ID } from '@/constants/appScroll';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { songToTrack } from '@/lib/media/songToTrack';
import { useTracklistColumns } from '@/lib/hooks/useTracklistColumns';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import ArtistAllTracksList from '@/features/artist/components/ArtistAllTracksList';
import {
  ARTIST_ALL_TRACKS_COLUMNS,
  ARTIST_ALL_TRACKS_STORAGE_KEY,
} from '@/features/artist/utils/artistAllTracksColumns';

const songs = [
  makeSubsonicSong({ id: 't1', title: 'First', album: 'Album A', duration: 200 }),
  makeSubsonicSong({ id: 't2', title: 'Second', album: 'Album A', duration: 315 }),
  makeSubsonicSong({ id: 't3', title: 'Third', album: 'Album B', duration: 61 }),
];

function List({ onPlay = () => {} }: { onPlay?: (songs: SubsonicSong[], index: number) => void }) {
  const columns = useTracklistColumns(ARTIST_ALL_TRACKS_COLUMNS, ARTIST_ALL_TRACKS_STORAGE_KEY);
  return <ArtistAllTracksList songs={songs} loading={false} failed={false} onPlay={onPlay} columns={columns} />;
}

describe('ArtistAllTracksList in the touch shell', () => {
  let viewport: HTMLDivElement;
  let offsetSpy: MockInstance;

  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
    viewport = document.createElement('div');
    viewport.id = APP_MAIN_SCROLL_VIEWPORT_ID;
    document.body.appendChild(viewport);
    // jsdom has no layout; give the page viewport a height so the virtualiser renders rows.
    offsetSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.id === APP_MAIN_SCROLL_VIEWPORT_ID ? 800 : 53;
      });
  });

  afterEach(() => {
    offsetSpy.mockRestore();
    viewport.remove();
  });

  it('renders the same touch rows as the ranking: no table header, no columns', () => {
    const { container } = renderWithProviders(<List />);
    expect(container.querySelector('.tracklist-header')).toBeNull();
    expect(container.querySelectorAll('.mobile-track[data-artist-track-row]')).toHaveLength(3);
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Album B')).toBeInTheDocument();
    expect(screen.getByText('5:15')).toBeInTheDocument();
  });

  it('tapping a row plays the list from that position', () => {
    const onPlay = vi.fn();
    renderWithProviders(<List onPlay={onPlay} />);
    fireEvent.click(screen.getByText('Second'));
    expect(onPlay).toHaveBeenCalledTimes(1);
    const [list, index] = onPlay.mock.calls[0] as [SubsonicSong[], number];
    expect(index).toBe(1);
    expect(list[index].id).toBe('t2');
  });

  it('the more button opens the song menu', () => {
    const openContextMenu = vi.fn();
    usePlayerStore.setState({ openContextMenu });
    renderWithProviders(<List />);
    fireEvent.click(screen.getByRole('button', { name: 'More options: Third' }));
    expect(openContextMenu).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), songToTrack(songs[2]), 'song');
  });
});
