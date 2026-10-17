import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Shuffle } from 'lucide-react';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { MobileVirtualSongList } from '@/features/mobileShell';
import { fetchOfflineLocalBrowsableSongPage } from '@/features/offline';
import { useOrbitSongRowBehavior } from '@/features/orbit';
import { usePlayerStore } from '@/features/playback';
import { useAuthStore } from '@/store/authStore';
import { useLocalPlaybackStore } from '@/store/localPlaybackStore';
import { songToTrack } from '@/lib/media/songToTrack';
import { prepareTransientUiOpen } from '@/lib/dom/transientUi';

const ALL_SONGS = Number.MAX_SAFE_INTEGER;

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Tracks offline (touch shell): every song on the device, A to Z, as touch
 * rows, with play and shuffle on top, as the album page reads.
 */
export default function TracksOfflineTouch() {
  const { t } = useTranslation();
  const serverId = useAuthStore(s => s.activeServerId);
  const entries = useLocalPlaybackStore(s => s.entries);
  const playTrack = usePlayerStore(s => s.playTrack);
  const openContextMenu = usePlayerStore(s => s.openContextMenu);
  const { orbitActive, orbitRowClick } = useOrbitSongRowBehavior();
  const [songs, setSongs] = useState<SubsonicSong[] | null>(null);

  useEffect(() => {
    if (!serverId) return;
    let cancelled = false;
    void fetchOfflineLocalBrowsableSongPage(serverId, 0, ALL_SONGS)
      .then(page => { if (!cancelled) setSongs(page?.songs ?? []); })
      .catch(() => { if (!cancelled) setSongs([]); });
    return () => { cancelled = true; };
  }, [serverId, entries]);

  if (songs === null) return null;
  if (songs.length === 0) {
    return <p className="mobile-downloads__empty">{t('connection.downloadsEmpty')}</p>;
  }

  const playFrom = (list: SubsonicSong[], index: number) => {
    const song = list[index];
    if (!song) return;
    if (orbitActive) { orbitRowClick(song.id, song.serverId); return; }
    playTrack(songToTrack(song), list.map(songToTrack));
  };

  return (
    <>
      <div className="mobile-album__buttons">
        <button type="button" className="mobile-album__btn mobile-album__btn--primary" onClick={() => playFrom(songs, 0)}>
          <Play size={18} fill="currentColor" aria-hidden="true" />
          {t('common.play')}
        </button>
        <button type="button" className="mobile-album__btn" onClick={() => playFrom(shuffled(songs), 0)}>
          <Shuffle size={19} aria-hidden="true" />
          {t('albumDetail.shuffle')}
        </button>
      </div>
      <MobileVirtualSongList
        songs={songs}
        onPlay={index => playFrom(songs, index)}
        onMore={(song, at) => {
          prepareTransientUiOpen();
          openContextMenu(at.x, at.y, songToTrack(song), 'song');
        }}
      />
    </>
  );
}
