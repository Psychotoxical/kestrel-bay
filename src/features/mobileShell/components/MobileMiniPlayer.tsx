import { useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Music, Pause, Play, Radio, SkipForward } from 'lucide-react';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { getPlaybackProgressSnapshot, subscribePlaybackProgress } from '@/features/playback/store/playbackProgress';
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

/** Floating mini player above the tab bar; tapping it opens the full player. */
export default function MobileMiniPlayer() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const currentRadio = usePlayerStore(s => s.currentRadio);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const next = usePlayerStore(s => s.next);

  const coverRef = usePlaybackTrackCoverRef(currentTrack ?? undefined);
  const { src, cacheKey } = usePlaybackCoverArt(coverRef, 96);
  const resolvedCover = useCachedUrl(src, cacheKey);
  const cover = currentTrack?.directCoverArtUrl ?? resolvedCover;

  if (!currentTrack && !currentRadio) return null;

  const title = currentRadio ? currentRadio.name : currentTrack?.title ?? '';
  const subtitle = currentRadio ? t('sidebar.radio') : currentTrack?.artist ?? '';

  return (
    <div className="mobile-miniplayer mobile-glass" data-visualizer-overlay-exempt="shell">
      <button
        type="button"
        className="mobile-miniplayer__open"
        onClick={() => navigate('/now-playing')}
        aria-label={`${t('sidebar.nowPlaying')}: ${title}`}
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
        aria-label={isPlaying ? t('player.pause') : t('player.play')}
      >
        {isPlaying
          ? <Pause size={24} fill="currentColor" aria-hidden="true" />
          : <Play size={24} fill="currentColor" aria-hidden="true" />}
      </button>
      {!currentRadio && (
        <button
          type="button"
          className="mobile-icon-btn"
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
