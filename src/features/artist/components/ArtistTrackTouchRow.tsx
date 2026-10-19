import React from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { SubsonicAlbum, SubsonicSong } from '@/lib/api/subsonicTypes';
import { formatTrackTime } from '@/lib/format/formatDuration';
import ArtistTopTrackCover from '@/features/artist/components/ArtistTopTrackCover';
import { topSongAlbumForCover } from '@/features/artist/components/topSongAlbumForCover';
import { songToTrack } from '@/lib/media/songToTrack';
import { MobileTrackCheck, useMobileTrackSelection } from '@/features/mobileShell';

interface Props {
  song: SubsonicSong;
  index: number;
  albums: ReadonlyArray<SubsonicAlbum>;
  isActive: boolean;
  showEq: boolean;
  onPlay: (index: number) => void;
  /** Opens the song menu at the "…" button. */
  onMore: (song: SubsonicSong, at: { x: number; y: number }) => void;
  /** `div` inside the virtualised full list; the ranking is a plain `ol`. */
  as?: 'li' | 'div';
}

/**
 * Artist track row in the touch shell, shared by the Top and All tabs so both
 * read the same: rank, album cover, title over album, duration, "…" menu. A long press
 * starts a multi-selection, during which a tap picks the row.
 */
function ArtistTrackTouchRow({ song, index, albums, isActive, showEq, onPlay, onMore, as: Tag = 'li' }: Props) {
  const { t } = useTranslation();
  const albumForCover = topSongAlbumForCover(song, albums);
  const selection = useMobileTrackSelection(songToTrack(song));
  return (
    <Tag
      className={`mobile-track${isActive ? ' is-active' : ''}${selection.selected ? ' is-selected' : ''}`}
      onContextMenu={(e: React.MouseEvent) => {
        e.preventDefault();
        selection.start();
      }}
      // Virtualised rows each sit in their own wrapper, where `:last-child` would drop every border.
      data-artist-track-row={Tag === 'div' ? '' : undefined}
    >
      <button
        type="button"
        className="mobile-track__main"
        aria-current={isActive ? 'true' : undefined}
        aria-pressed={selection.selecting ? selection.selected : undefined}
        onClick={selection.selecting ? selection.toggle : () => onPlay(index)}
      >
        {selection.selecting && <MobileTrackCheck selected={selection.selected} />}
        <span className="mobile-track__num">
          {showEq
            ? <span className="mobile-playing-bars" aria-hidden="true"><span /><span /><span /></span>
            : index + 1}
        </span>
        <span className="mobile-track__cover">
          {albumForCover ? <ArtistTopTrackCover album={albumForCover} fill /> : null}
        </span>
        <span className="mobile-track__text">
          <span className="mobile-track__title">{song.title}</span>
          {song.album && <span className="mobile-track__artist">{song.album}</span>}
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
    </Tag>
  );
}

export default React.memo(ArtistTrackTouchRow);
