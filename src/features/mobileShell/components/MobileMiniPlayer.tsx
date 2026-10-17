import { useRef, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Music, Pause, Play, Radio, SkipForward } from 'lucide-react';
import { getPlaybackProgressSnapshot, subscribePlaybackProgress, usePlayerStore } from '@/features/playback';
import { isOrbitGuestFollowingHost, useOrbitStore } from '@/features/orbit';
import { usePlaybackCoverArt } from '@/cover/usePlaybackCoverArt';
import { usePlaybackTrackCoverRef } from '@/cover/useLibraryCoverRef';
import { useCachedUrl } from '@/ui/CachedImage';

function MiniProgress() {
  const progress = useSyncExternalStore(
    onStoreChange => subscribePlaybackProgress(() => onStoreChange()),
    () => getPlaybackProgressSnapshot().progress,
    () => getPlaybackProgressSnapshot().progress,
  );
  return (
    <span className="mobile-miniplayer__progress" aria-hidden="true">
      <span style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
    </span>
  );
}

/** Upward finger travel on the mini player that opens the full player. */
const SWIPE_OPEN_PX = 30;

/** Floating mini player above the tab bar; tapping it or swiping it up opens the full player. */
export default function MobileMiniPlayer() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const currentRadio = usePlayerStore(s => s.currentRadio);
  // An Orbit guest follows the host; skipping would only stop the local player.
  const guestFollowsHost = useOrbitStore(s => isOrbitGuestFollowingHost(s.role, s.phase));
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const next = usePlayerStore(s => s.next);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const coverRef = usePlaybackTrackCoverRef(currentTrack ?? undefined);
  const { src, cacheKey } = usePlaybackCoverArt(coverRef, 96);
  const resolvedCover = useCachedUrl(src, cacheKey);
  const cover = currentTrack?.directCoverArtUrl ?? resolvedCover;

  if (!currentTrack && !currentRadio) return null;

  const title = currentRadio ? currentRadio.name : currentTrack?.title ?? '';
  const subtitle = currentRadio ? t('sidebar.radio') : currentTrack?.artist ?? '';

  return (
    <div
      className="mobile-miniplayer mobile-glass"
      data-visualizer-overlay-exempt="shell"
      onTouchStart={e => {
        const touch = e.touches[0];
        swipeStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchMove={e => {
        const start = swipeStartRef.current;
        const touch = e.touches[0];
        if (!start || !touch) return;
        const dy = touch.clientY - start.y;
        if (dy < -SWIPE_OPEN_PX && Math.abs(dy) > Math.abs(touch.clientX - start.x)) {
          swipeStartRef.current = null;
          navigate('/now-playing');
        }
      }}
      onTouchEnd={() => { swipeStartRef.current = null; }}
    >
      <button
        type="button"
        className="mobile-miniplayer__open"
        onClick={() => navigate('/now-playing')}
        aria-label={`${t('queue.touchNowPlaying')}: ${title}`}
      >
        <span className="mobile-miniplayer__cover">
          {!currentRadio && cover
            ? <img src={cover} alt="" />
            : currentRadio ? <Radio size={22} aria-hidden="true" /> : <Music size={22} aria-hidden="true" />}
        </span>
        <span className="mobile-miniplayer__text">
          <span className="mobile-miniplayer__title">{title}</span>
          <span className="mobile-miniplayer__subtitle">{subtitle}</span>
        </span>
      </button>
      <button
        type="button"
        className="mobile-icon-btn"
        onClick={() => togglePlay()}
        aria-label={isPlaying ? t('player.pause') : t('common.play')}
      >
        {isPlaying
          ? <Pause size={24} fill="currentColor" aria-hidden="true" />
          : <Play size={24} fill="currentColor" aria-hidden="true" />}
      </button>
      {!currentRadio && !guestFollowsHost && (
        <button
          type="button"
          className="mobile-icon-btn mobile-miniplayer__next"
          onClick={() => next()}
          aria-label={t('player.next')}
        >
          <SkipForward size={24} fill="currentColor" aria-hidden="true" />
        </button>
      )}
      <MiniProgress />
    </div>
  );
}
