import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  ChevronDown, ChevronUp, Heart, ListMusic, MicVocal, Moon, MoreHorizontal, Music, Pause, Play, Radio,
  Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Sunrise,
} from 'lucide-react';
import {
  getPlaybackProgressSnapshot,
  PlaybackDelayModal,
  PlaybackScheduleBadge,
  queueSongStar,
  subscribePlaybackProgress,
  TrackArtistLinks,
  usePlaybackDelayPress,
  usePlaybackLibraryNavigate,
  usePlaybackScheduleRemaining,
  usePlayerStore,
} from '@/features/playback';
import { usePlaybackCoverArt } from '@/cover/usePlaybackCoverArt';
import { usePlaybackTrackCoverRef } from '@/cover/useLibraryCoverRef';
import { useCachedUrl } from '@/ui/CachedImage';
import { CoverArtImage } from '@/cover/CoverArtImage';
import { radioCoverRef } from '@/cover/ref';
import PsysonicLogo from '@/ui/PsysonicLogo';
import TouchMarquee from './TouchMarquee';
import { useCoverAccentColor } from '@/features/nowPlaying';
import { LyricsPane } from '@/features/lyrics';
import { WaveformSeek } from '@/features/waveform';
import { effectiveAudioFormat } from '@/lib/media/streamFormat';
import { formatTrackTime } from '@/lib/format/formatDuration';
import { ownedOverrideValue } from '@/lib/util/ownedEntityKey';
import { prepareTransientUiOpen } from '@/lib/dom/transientUi';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';
import { allowLandscape } from '@/features/mobileShell/utils/landscape';
import { isOrbitGuestFollowingHost, useOrbitStore } from '@/features/orbit';
import MobileQueueSheet from '@/features/mobileShell/components/MobileQueueSheet';
import MobileAudioOptionsSheet from '@/features/mobileShell/components/MobileAudioOptionsSheet';

/** Height of the seek area, plain bar or waveform alike (px). */
const SEEK_SLOT_PX = 32;

/** Finger travel before a downward swipe takes over. */
const SWIPE_START_PX = 12;
/** Swipe distance that closes the player on release. */
const SWIPE_CLOSE_PX = 120;
/** Sideways swipe across the cover that skips on release (left: next, right: previous). */
const SWIPE_SKIP_PX = 70;

function usePlaybackProgress() {
  return useSyncExternalStore(
    onStoreChange => subscribePlaybackProgress(() => onStoreChange()),
    getPlaybackProgressSnapshot,
    getPlaybackProgressSnapshot,
  );
}

/**
 * Seek bar with drag preview; the seek is sent once on release. Once the
 * track's waveform is analysed, the desktop waveform seekbar (in the user's
 * seekbar style) replaces the plain bar.
 */
function Scrubber({ duration, formatLabel }: { duration: number; formatLabel: string | null }) {
  const { t } = useTranslation();
  const seek = usePlayerStore(s => s.seek);
  const currentTrackId = usePlayerStore(s => s.currentTrack?.id);
  const hasWaveform = usePlayerStore(s => (s.waveformBins?.length ?? 0) > 0);
  const { progress, currentTime } = usePlaybackProgress();
  const barRef = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    // React Compiler set-state-in-effect rule: a track change cancels a drag preview.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreview(null);
    draggingRef.current = false;
  }, [currentTrackId]);

  const fractionAt = (clientX: number) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const shown = preview ?? progress;
  const shownTime = preview !== null && duration > 0 ? preview * duration : currentTime;

  return (
    <div className="mobile-player__scrubber">
      {/* Fixed-height slot: the cover keeps its size when the waveform arrives. */}
      <div className="mobile-player__seek-slot">
      {hasWaveform ? (
        <div
          className="mobile-player__waveform"
          role="slider"
          tabIndex={0}
          aria-label={t('player.seek')}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(currentTime)}
          aria-valuetext={formatTrackTime(currentTime)}
          onKeyDown={e => {
            if (duration <= 0) return;
            const step = 5 / duration;
            if (e.key === 'ArrowRight') seek(Math.min(1, progress + step));
            if (e.key === 'ArrowLeft') seek(Math.max(0, progress - step));
          }}
        >
          <WaveformSeek trackId={currentTrackId} height={SEEK_SLOT_PX} touch />
        </div>
      ) : (
      <div
        ref={barRef}
        className={`mobile-player__bar${preview !== null ? ' is-dragging' : ''}`}
        role="slider"
        tabIndex={0}
        aria-label={t('player.seek')}
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shownTime)}
        aria-valuetext={formatTrackTime(shownTime)}
        onPointerDown={e => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          setPreview(fractionAt(e.clientX));
        }}
        onPointerMove={e => { if (draggingRef.current) setPreview(fractionAt(e.clientX)); }}
        onPointerUp={e => {
          if (!draggingRef.current) return;
          draggingRef.current = false;
          const fraction = fractionAt(e.clientX);
          setPreview(null);
          seek(fraction);
        }}
        onPointerCancel={() => { draggingRef.current = false; setPreview(null); }}
        onKeyDown={e => {
          if (duration <= 0) return;
          const step = 5 / duration;
          if (e.key === 'ArrowRight') seek(Math.min(1, progress + step));
          if (e.key === 'ArrowLeft') seek(Math.max(0, progress - step));
        }}
      >
        <span className="mobile-player__bar-fill" style={{ transform: `scaleX(${shown})` }} />
      </div>
      )}
      </div>
      <div className="mobile-player__times">
        <span>{formatTrackTime(shownTime)}</span>
        {formatLabel && <span className="mobile-player__format">{formatLabel}</span>}
        <span>-{formatTrackTime(Math.max(0, duration - shownTime))}</span>
      </div>
    </div>
  );
}

/** Full-screen player for `/now-playing` in the touch shell. */
export default function MobilePlayer() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const navigatePlaybackLibrary = usePlaybackLibraryNavigate();
  const currentTrack = usePlayerStore(s => s.currentTrack);
  // Phones: the player is the one screen that may turn sideways.
  useEffect(() => {
    allowLandscape(true);
    return () => allowLandscape(false);
  }, []);
  const currentRadio = usePlayerStore(s => s.currentRadio);
  // An Orbit guest follows the host; skipping would only stop the local player.
  const guestFollowsHost = useOrbitStore(s => isOrbitGuestFollowingHost(s.role, s.phase));
  const skipLockedTitle = guestFollowsHost ? t('settings.transitionsHostControlled') : undefined;
  const resolvedStreamFormat = usePlayerStore(s => s.resolvedStreamFormat);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const togglePlay = usePlayerStore(s => s.togglePlay);
  const next = usePlayerStore(s => s.next);
  const previous = usePlayerStore(s => s.previous);
  const repeatMode = usePlayerStore(s => s.repeatMode);
  const toggleRepeat = usePlayerStore(s => s.toggleRepeat);
  const shuffleMode = usePlayerStore(s => s.shuffleMode);
  const toggleShuffleMode = usePlayerStore(s => s.toggleShuffleMode);
  const starredOverrides = usePlayerStore(s => s.starredOverrides);
  const openContextMenu = usePlayerStore(s => s.openContextMenu);
  const { delayModalOpen, setDelayModalOpen, playPauseBind } = usePlaybackDelayPress(togglePlay);
  const scheduleRemaining = usePlaybackScheduleRemaining();
  const transportRef = useRef<HTMLDivElement>(null);
  const playSlotRef = useRef<HTMLSpanElement>(null);
  const moreWasOpenRef = useRef(false);
  const [sheet, setSheet] = useState<'queue' | 'lyrics' | 'audio' | null>(null);
  // Swipe down anywhere (outside the seek bar and chip row) closes the player; sideways
  // across the cover skips, as in most players.
  const swipeRef = useRef<{
    x: number; y: number; axis: 'down' | 'side' | null; onCover: boolean; dy: number; dx: number;
  } | null>(null);
  const [swipeY, setSwipeY] = useState(0);
  const [coverX, setCoverX] = useState(0);

  const coverRef = usePlaybackTrackCoverRef(currentTrack ?? undefined);
  const { src, cacheKey } = usePlaybackCoverArt(coverRef, 800, {
    // Playback arms the cover chain (see MobilePlayerView): an album playing
    // without a page visit has only the backfill ladder otherwise.
    ensureOpts: {
      artistName: currentTrack?.artist ?? '',
      albumTitle: currentTrack?.album ?? '',
      allowExternalAlbum: true,
    },
  });
  const resolvedCover = useCachedUrl(src, cacheKey);
  const cover = currentTrack?.directCoverArtUrl ?? resolvedCover;
  const accent = useCoverAccentColor(cover);

  const isStarred = currentTrack
    ? (ownedOverrideValue(starredOverrides, currentTrack) ?? !!currentTrack.starred)
    : false;
  const toggleStar = useCallback(() => {
    if (!currentTrack) return;
    queueSongStar(currentTrack.id, !isStarred, currentTrack.serverId);
  }, [currentTrack, isStarred]);

  const close = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/', { replace: true });
  };

  const format = currentTrack ? effectiveAudioFormat(currentTrack, resolvedStreamFormat) : null;
  const formatLabel = format
    ? [format.formatLabel, format.bitRate ? `${format.bitRateIsCap ? '≤' : ''}${format.bitRate} kbps` : null]
      .filter(Boolean).join(' · ') || null
    : null;

  const style = {
    '--mobile-player-tint': accent === '0,0,0' ? 'var(--accent-dim)' : `rgba(${accent}, 0.42)`,
  } as CSSProperties;

  const title = currentRadio ? currentRadio.name : currentTrack?.title;

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const target = e.target as Element;
    // Touches inside the queue/lyrics sheets bubble here through the portal.
    if (!e.currentTarget.contains(target)) return;
    if (target.closest('[role="slider"], input, .mobile-chips')) return;
    const touch = e.touches[0];
    const onCover = !!target.closest('.mobile-player__cover') && !currentRadio && !guestFollowsHost;
    swipeRef.current = { x: touch.clientX, y: touch.clientY, axis: null, onCover, dy: 0, dx: 0 };
  };
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    if (!swipe) return;
    const touch = e.touches[0];
    const dy = touch.clientY - swipe.y;
    const dx = touch.clientX - swipe.x;
    if (!swipe.axis) {
      if (dy > SWIPE_START_PX && dy > Math.abs(dx)) swipe.axis = 'down';
      else if (swipe.onCover && Math.abs(dx) > SWIPE_START_PX && Math.abs(dx) > Math.abs(dy)) swipe.axis = 'side';
      else if (Math.abs(dx) > SWIPE_START_PX || dy < -SWIPE_START_PX) {
        swipeRef.current = null;
        return;
      }
    }
    if (swipe.axis === 'down') {
      swipe.dy = Math.max(0, dy);
      setSwipeY(swipe.dy);
    } else if (swipe.axis === 'side') {
      swipe.dx = dx;
      setCoverX(dx);
    }
  };
  const onTouchEnd = () => {
    const swipe = swipeRef.current;
    swipeRef.current = null;
    // The ref, not state: the last move may not have rendered yet.
    if (swipe?.axis === 'down' && swipe.dy > SWIPE_CLOSE_PX) close();
    else setSwipeY(0);
    if (swipe?.axis === 'side') {
      if (swipe.dx <= -SWIPE_SKIP_PX) next();
      else if (swipe.dx >= SWIPE_SKIP_PX) previous();
    }
    setCoverX(0);
  };

  return (
    <div
      className="mobile-player"
      style={swipeY > 0 ? { ...style, transform: `translateY(${swipeY}px)`, transition: 'none' } : style}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="mobile-player__top">
        <button type="button" className="mobile-player__close" onClick={close} aria-label={t('common.back')}>
          <ChevronDown size={30} strokeWidth={2} aria-hidden="true" />
        </button>
        <PsysonicLogo className="mobile-player__logo" gradientIdSuffix="mobile-player" />
      </div>

      {!title ? (
        <div className="mobile-player__empty">
          <Music size={56} aria-hidden="true" />
          <p>{t('nowPlaying.nothingPlaying')}</p>
        </div>
      ) : (
        <>
          <div className="mobile-player__cover-area">
            <div
              className="mobile-player__cover"
              style={coverX !== 0 ? { transform: `translateX(${coverX}px)`, opacity: Math.max(0.4, 1 - Math.abs(coverX) / 400), transition: 'none' } : undefined}
            >
              {currentRadio?.coverArt
                ? <CoverArtImage coverRef={radioCoverRef(currentRadio)} displayCssPx={320} alt="" />
                : !currentRadio && cover
                ? <img src={cover} alt="" />
                : <span className="mobile-player__cover-fallback">
                    {currentRadio ? <Radio size={72} aria-hidden="true" /> : <Music size={72} aria-hidden="true" />}
                  </span>}
            </div>
          </div>

          <div className="mobile-player__body">
            <div className="mobile-player__meta">
              <div className="mobile-player__meta-text">
                <TouchMarquee className="mobile-player__title" measureKey={title}>{title}</TouchMarquee>
                <TouchMarquee className="mobile-player__artist" measureKey={currentTrack?.id}>
                  {currentTrack && !currentRadio
                    ? <TrackArtistLinks track={currentTrack} onNavigate={navigatePlaybackLibrary} />
                    : t('sidebar.radio')}
                </TouchMarquee>
              </div>
            </div>

            {!currentRadio && <Scrubber duration={currentTrack?.duration ?? 0} formatLabel={formatLabel} />}

            <div className="mobile-player__transport" ref={transportRef}>
              <button
                type="button"
                className={`mobile-icon-btn mobile-icon-btn--small${shuffleMode ? ' is-active' : ''}`}
                onClick={toggleShuffleMode}
                aria-pressed={shuffleMode}
                aria-label={t('player.shuffle')}
                disabled={!!currentRadio}
              >
                <Shuffle size={22} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="mobile-icon-btn mobile-icon-btn--large"
                onClick={() => previous()}
                aria-label={t('player.prev')}
                title={skipLockedTitle}
                disabled={!!currentRadio || guestFollowsHost}
              >
                <SkipBack size={36} fill="currentColor" aria-hidden="true" />
              </button>
              <span className="playback-transport-play-wrap" ref={playSlotRef}>
                <PlaybackScheduleBadge layoutAnchorRef={playSlotRef} />
                <button
                  type="button"
                  className="mobile-player__play"
                  {...playPauseBind}
                  aria-label={isPlaying ? t('player.pause') : t('common.play')}
                >
                  {scheduleRemaining != null ? (
                    <span className={`player-btn-schedule-stack player-btn-schedule-stack--${scheduleRemaining.mode} player-btn-schedule-stack--mobile`}>
                      {scheduleRemaining.mode === 'pause'
                        ? <Moon size={13} strokeWidth={2.5} aria-hidden="true" />
                        : <Sunrise size={13} strokeWidth={2.5} aria-hidden="true" />}
                      <span className="player-btn-schedule-time player-btn-schedule-time--mobile">{scheduleRemaining.remaining}</span>
                    </span>
                  ) : isPlaying
                    ? <Pause size={28} fill="currentColor" aria-hidden="true" />
                    : <Play size={28} fill="currentColor" aria-hidden="true" />}
                </button>
              </span>
              <button
                type="button"
                className="mobile-icon-btn mobile-icon-btn--large"
                onClick={() => next()}
                aria-label={t('player.next')}
                title={skipLockedTitle}
                disabled={!!currentRadio || guestFollowsHost}
              >
                <SkipForward size={36} fill="currentColor" aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`mobile-icon-btn mobile-icon-btn--small${repeatMode !== 'off' ? ' is-active' : ''}`}
                onClick={toggleRepeat}
                aria-pressed={repeatMode !== 'off'}
                aria-label={t('player.repeat')}
                disabled={!!currentRadio}
              >
                {repeatMode === 'one' ? <Repeat1 size={22} aria-hidden="true" /> : <Repeat size={22} aria-hidden="true" />}
              </button>
            </div>

            {/* Transitions and normalization slide up from this arrow (an options sheet over the player). */}
            <div className="mobile-player__modes">
              <button
                type="button"
                className="mobile-player__options-btn"
                aria-label={t('settings.tabAudio')}
                aria-haspopup="dialog"
                onClick={() => setSheet('audio')}
              >
                <ChevronUp size={28} strokeWidth={2.4} aria-hidden="true" />
              </button>
            </div>

            {/* Icon-only; the names are the buttons' accessible labels. */}
            <div className="mobile-player__footer">
              <button
                type="button"
                className={`mobile-footer-btn${isStarred ? ' is-active' : ''}`}
                onClick={toggleStar}
                aria-pressed={isStarred}
                aria-label={isStarred ? t('contextMenu.unfavorite') : t('contextMenu.favorite')}
                disabled={!currentTrack || !!currentRadio}
              >
                <Heart size={22} fill={isStarred ? 'currentColor' : 'none'} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="mobile-footer-btn"
                onClick={() => setSheet('lyrics')}
                aria-label={t('player.lyrics')}
                disabled={!!currentRadio}
              >
                <MicVocal size={22} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="mobile-footer-btn"
                onClick={() => setSheet('queue')}
                aria-label={t('queue.title')}
              >
                <ListMusic size={22} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="mobile-footer-btn"
                aria-label={t('player.moreOptions')}
                aria-haspopup="menu"
                disabled={!currentTrack || !!currentRadio}
                // The menu closes on mousedown, which lands before this click:
                // note on pointerdown whether it was open, so a second tap closes it.
                onPointerDown={() => { moreWasOpenRef.current = usePlayerStore.getState().contextMenu.isOpen; }}
                onClick={e => {
                  if (moreWasOpenRef.current) { moreWasOpenRef.current = false; return; }
                  if (!currentTrack) return;
                  prepareTransientUiOpen();
                  const r = e.currentTarget.getBoundingClientRect();
                  openContextMenu(r.right, r.top, currentTrack, 'song', undefined, undefined, undefined, undefined, true, undefined, undefined, true);
                }}
              >
                <MoreHorizontal size={22} aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      )}

      {sheet === 'queue' && <MobileQueueSheet onClose={() => setSheet(null)} />}
      {sheet === 'audio' && <MobileAudioOptionsSheet radio={!!currentRadio} onClose={() => setSheet(null)} />}
      {sheet === 'lyrics' && (
        <MobileSheet title={t('player.lyrics')} onClose={() => setSheet(null)} className="mobile-sheet--tall">
          <LyricsPane currentTrack={currentTrack} />
        </MobileSheet>
      )}
      <PlaybackDelayModal open={delayModalOpen} onClose={() => setDelayModalOpen(false)} anchorRef={transportRef} />
    </div>
  );
}
