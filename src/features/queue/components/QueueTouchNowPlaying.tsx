import type { TFunction } from 'i18next';
import { Music } from 'lucide-react';
import type { Track } from '@/lib/media/trackTypes';
import { usePlaybackCoverArt } from '@/cover/usePlaybackCoverArt';
import { usePlaybackTrackCoverRef } from '@/cover/useLibraryCoverRef';
import { useCachedUrl } from '@/ui/CachedImage';
import { usePlayerStore } from '@/features/playback';

/** "Now playing" row above the upcoming list in the touch queue (queue mode). */
export function QueueTouchNowPlaying({ track, t }: { track: Track; t: TFunction }) {
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const coverRef = usePlaybackTrackCoverRef(track);
  const { src, cacheKey } = usePlaybackCoverArt(coverRef, 96);
  const resolved = useCachedUrl(src, cacheKey);
  const cover = track.directCoverArtUrl ?? resolved;

  return (
    <div className="queue-touch-now">
      <span className="queue-touch-label">{t('queue.touchNowPlaying')}</span>
      <div className="queue-touch-now__row">
        <span className="queue-touch-now__cover">
          {cover ? <img src={cover} alt="" /> : <Music size={20} aria-hidden="true" />}
        </span>
        <span className="queue-touch-now__text">
          <span className="queue-touch-now__title">{track.title}</span>
          <span className="queue-touch-now__artist">{track.artist}</span>
        </span>
        {isPlaying && (
          <span className="mobile-playing-bars" aria-hidden="true">
            <span /><span /><span />
          </span>
        )}
      </div>
    </div>
  );
}
