import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { formatTrackTime } from '@/lib/format/formatDuration';
import { songToTrack } from '@/lib/media/songToTrack';
import { ownedEntityKey } from '@/lib/util/ownedEntityKey';
import { CoverArtImage } from '@/cover/CoverArtImage';
import { albumCoverRefForSong } from '@/cover/ref';
import { coverServerScopeForOwnerServerId } from '@/cover/serverScope';
import { sameQueueTrack, usePlayerStore } from '@/features/playback';
import { useSongRowPlay } from '@/features/search';
import { MobileTrackCheck, useMobileTrackSelection } from '@/features/mobileShell';

const THUMB_CSS_PX = 80;

function TrackThumb({ song }: { song: SubsonicSong }) {
  const coverRef = useMemo(
    () => (song.albumId?.trim()
      ? albumCoverRefForSong(
          song,
          undefined,
          song.serverId ? coverServerScopeForOwnerServerId(song.serverId) : undefined,
        )
      : undefined),
    // Keyed on the song's identity fields; the `song` object itself changes on every page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [song.id, song.albumId, song.coverArt, song.discNumber, song.serverId],
  );
  if (!coverRef) return null;
  return (
    <CoverArtImage coverRef={coverRef} displayCssPx={THUMB_CSS_PX} surface="dense" alt="" />
  );
}

interface RowProps {
  song: SubsonicSong;
  index: number;
  isActive: boolean;
  showEq: boolean;
  onPlay: (song: SubsonicSong) => void;
  onMore: (song: SubsonicSong, at: { x: number; y: number }) => void;
}

function MoodTrackTouchRow({ song, index, isActive, showEq, onPlay, onMore }: RowProps) {
  const { t } = useTranslation();
  const selection = useMobileTrackSelection(songToTrack(song));
  return (
    <li
      className={`mobile-track${isActive ? ' is-active' : ''}${selection.selected ? ' is-selected' : ''}`}
      onContextMenu={(e: React.MouseEvent) => {
        e.preventDefault();
        selection.start();
      }}
    >
      <button
        type="button"
        className="mobile-track__main"
        aria-current={isActive ? 'true' : undefined}
        aria-pressed={selection.selecting ? selection.selected : undefined}
        onClick={selection.selecting ? selection.toggle : () => onPlay(song)}
      >
        {selection.selecting && <MobileTrackCheck selected={selection.selected} />}
        <span className="mobile-track__num">
          {showEq
            ? <span className="mobile-playing-bars" aria-hidden="true"><span /><span /><span /></span>
            : index + 1}
        </span>
        <span className="mobile-track__cover">
          <TrackThumb song={song} />
        </span>
        <span className="mobile-track__text">
          <span className="mobile-track__title">{song.title}</span>
          {song.artist && <span className="mobile-track__artist">{song.artist}</span>}
        </span>
        <span className="mobile-track__time">{formatTrackTime(song.duration)}</span>
      </button>
      <button
        type="button"
        className="mobile-track__more"
        aria-label={`${t('player.moreOptions')}: ${song.title}`}
        aria-haspopup="menu"
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect();
          onMore(song, { x: r.right, y: r.bottom });
        }}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
    </li>
  );
}

/**
 * Touch rows for the mood's Tracks view: cover, title over artist, duration, "…" menu.
 * Same play path as the desktop song list (`useSongRowPlay`); paging stays with the page.
 */
export default function MoodTracksTouchList({ songs }: { songs: SubsonicSong[] }) {
  const playSong = useSongRowPlay();
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const openContextMenu = usePlayerStore(s => s.openContextMenu);
  const openMenu = (song: SubsonicSong, at: { x: number; y: number }) =>
    openContextMenu(at.x, at.y, songToTrack(song), 'song');
  return (
    <ol className="mobile-tracklist mobile-top-tracks">
      {songs.map((song, i) => {
        const isActive = sameQueueTrack(currentTrack, song);
        return (
          <MoodTrackTouchRow
            key={ownedEntityKey(song)}
            song={song}
            index={i}
            isActive={isActive}
            showEq={isActive && isPlaying}
            onPlay={playSong}
            onMore={openMenu}
          />
        );
      })}
    </ol>
  );
}
