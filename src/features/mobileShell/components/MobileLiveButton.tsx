import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Pause, PlayCircle, Radio } from 'lucide-react';
import {
  PresenceCover,
  formatNowPlayingClock,
  nowPlayingPresence,
  useNowPlayingFeed,
  type NowPlayingFeed,
} from '@/features/nowPlaying';
import type { SubsonicNowPlaying } from '@/lib/api/subsonicTypes';
import { appendServerQuery } from '@/lib/navigation/detailServerScope';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';

function LiveRow({ stream, positionSec, onOpen }: {
  stream: SubsonicNowPlaying;
  positionSec: number | undefined;
  onOpen: (() => void) | null;
}) {
  const { t } = useTranslation();
  const presence = nowPlayingPresence(stream);
  const presenceLabel = t(`nowPlaying.presence.${presence}`);
  const showProgress = positionSec !== undefined && stream.duration > 0;
  const playing = stream.state === 'playing';
  const body = (
    <>
      <span className="mobile-live-row__cover">
        {stream.albumId ? <PresenceCover stream={stream} /> : <PlayCircle size={24} aria-hidden="true" />}
      </span>
      <span className="mobile-live-row__text">
        <span className="mobile-live-row__title">
          <span className={`now-playing-led now-playing-led--${presence}`} role="img" aria-label={presenceLabel} />
          <span className="mobile-live-row__ellipsis">{stream.title}</span>
        </span>
        <span className="mobile-live-row__sub mobile-live-row__ellipsis">{stream.artist}</span>
        <span className="mobile-live-row__who mobile-live-row__ellipsis">
          {stream.username} ({stream.playerName || 'Web'})
        </span>
        {showProgress && (
          <span className="mobile-live-row__progress">
            {stream.state === 'paused' && <Pause size={11} aria-hidden="true" />}
            <span className="mobile-live-row__bar">
              <span
                className={`mobile-live-row__fill${playing ? ' mobile-live-row__fill--playing' : ''}`}
                style={{ width: `${Math.min(100, Math.max(0, (positionSec / stream.duration) * 100))}%` }}
              />
            </span>
            <span className="mobile-live-row__time">
              {formatNowPlayingClock(positionSec)} / {formatNowPlayingClock(stream.duration)}
            </span>
          </span>
        )}
      </span>
    </>
  );
  return onOpen ? (
    <button type="button" className="mobile-live-row" onClick={onOpen}>{body}</button>
  ) : (
    <div className="mobile-live-row">{body}</div>
  );
}

/** "Who is listening?" as a sheet: one group per server, a row per listener. */
function MobileLiveSheet({ feed, onClose }: { feed: NowPlayingFeed; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openAlbum = (stream: SubsonicNowPlaying) => {
    onClose();
    const search = appendServerQuery(undefined, stream.serverId);
    navigate(`/album/${stream.albumId}${search ? `?${search}` : ''}`);
  };

  return (
    <MobileSheet title={t('nowPlaying.title')} onClose={onClose} className="mobile-sheet--live">
      {feed.visible.length === 0 ? (
        <p className="mobile-live-empty">{feed.loading ? t('nowPlaying.loading') : t('nowPlaying.nobody')}</p>
      ) : feed.visibleGroups.map(group => (
        <section key={group.serverId} className="mobile-source-section" aria-label={group.serverLabel}>
          {feed.multiServerScope && <h3 className="mobile-source-section__title">{group.serverLabel}</h3>}
          <div className="mobile-list-group">
            {group.rows.map((stream, idx) => (
              <LiveRow
                key={`${stream.serverId ?? 'unknown'}:${stream.username}:${stream.playerId}:${stream.id}:${idx}`}
                stream={stream}
                positionSec={feed.livePositionSec(stream)}
                onOpen={stream.albumId ? () => openAlbum(stream) : null}
              />
            ))}
          </div>
        </section>
      ))}
    </MobileSheet>
  );
}

/**
 * Touch shell: the desktop's "Live" header button as a round button on the
 * Mainstage header. It pulses in the theme accent while someone listens; a tap
 * opens who is listening to what on the browsed servers.
 */
export default function MobileLiveButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const feed = useNowPlayingFeed(open);
  const listeners = feed.visible.length;

  return (
    <>
      <button
        type="button"
        className={`mobile-round-btn mobile-live-btn${listeners > 0 ? ' mobile-live-btn--active' : ''}`}
        aria-label={listeners > 0 ? `${t('nowPlaying.title')} · ${listeners}` : t('nowPlaying.title')}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Radio size={20} strokeWidth={1.9} aria-hidden="true" />
      </button>
      {open && <MobileLiveSheet feed={feed} onClose={() => setOpen(false)} />}
    </>
  );
}
