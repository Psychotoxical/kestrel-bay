import React from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { formatTrackTime } from '@/lib/format/formatDuration';
import { BrowseTrackRowCoverThumb } from '@/cover/TrackRowCoverThumb';

interface Props {
  song: SubsonicSong;
  index: number;
  isActive: boolean;
  showEq: boolean;
  onPlay: (index: number) => void;
  /** Opens the song menu at the "…" button. */
  onMore: (song: SubsonicSong, at: { x: number; y: number }) => void;
}

/**
 * A song in a touch-shell list (favourites, random mix), as the album and
 * artist track lists read: number, album cover, title over artist, duration,
 * "…" menu. Tapping plays.
 */
function MobileSongRow({ song, index, isActive, showEq, onPlay, onMore }: Props) {
  const { t } = useTranslation();
  return (
    // Virtualised: each row sits in its own wrapper, where `:last-child` would drop every border.
    <div className={`mobile-track${isActive ? ' is-active' : ''}`} data-virtual-track-row="">
      <button
        type="button"
        className="mobile-track__main"
        aria-current={isActive ? 'true' : undefined}
        onClick={() => onPlay(index)}
      >
        <span className="mobile-track__num">
          {showEq
            ? <span className="mobile-playing-bars" aria-hidden="true"><span /><span /><span /></span>
            : index + 1}
        </span>
        <span className="mobile-track__cover">
          <BrowseTrackRowCoverThumb song={song} size="row" />
        </span>
        <span className="mobile-track__text">
          <span className="mobile-track__title">{song.title}</span>
          {song.artist && <span className="mobile-track__artist">{song.artist}</span>}
        </span>
        <span className="mobile-track__time">{formatTrackTime(song.duration ?? 0)}</span>
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
    </div>
  );
}

export default React.memo(MobileSongRow);
