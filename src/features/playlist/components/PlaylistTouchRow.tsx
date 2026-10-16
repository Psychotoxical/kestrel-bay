import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal } from 'lucide-react';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { formatTrackTime } from '@/lib/format/formatDuration';
import { OptionalBrowseTrackRowCoverThumb } from '@/cover/TrackRowCoverThumb';
import type { PlaylistRowCallbacks } from '@/features/playlist/components/PlaylistRow';
import { prepareTransientUiOpen } from '@/lib/dom/transientUi';

interface Props {
  song: SubsonicSong;
  index: number;
  realIdx: number;
  isActive: boolean;
  showEq: boolean;
  cb: PlaylistRowCallbacks;
}

/**
 * Playlist track row in the touch shell: tap plays, "…" opens the same menu as
 * the desktop right click (incl. remove from playlist). Cover only when the
 * user's track-list covers setting is on.
 */
function PlaylistTouchRow({ song, index, realIdx, isActive, showEq, cb }: Props) {
  const { t } = useTranslation();
  return (
    <div className={`mobile-track${isActive ? ' is-active' : ''}`} data-playlist-touch-row={index}>
      <button
        type="button"
        className="mobile-track__main"
        aria-current={isActive ? 'true' : undefined}
        onClick={() => cb.play(index)}
      >
        <span className="mobile-track__num">
          {showEq
            ? <span className="mobile-playing-bars" aria-hidden="true"><span /><span /><span /></span>
            : index + 1}
        </span>
        <OptionalBrowseTrackRowCoverThumb song={song} size="dense" />
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
          prepareTransientUiOpen();
          const r = e.currentTarget.getBoundingClientRect();
          cb.context(song, realIdx, e, { x: r.right, y: r.bottom });
        }}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

export default memo(PlaylistTouchRow);
