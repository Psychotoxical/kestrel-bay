import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { getSong, getSongForServer } from '@/lib/api/subsonicLibrary';
import { libraryGetFacts } from '@/lib/api/library';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { ndGetSongPath } from '@/lib/api/navidromeAdmin';
import { useAuthStore } from '@/store/authStore';
import { useLibraryIndexStore } from '@/store/libraryIndexStore';
import { libraryIsReady } from '@/lib/library/libraryReady';
import { parseTrackEnrichmentFacts, type ParsedTrackEnrichment } from '@/lib/library/trackEnrichment';

/**
 * What the Song Info dialog shows (desktop modal and touch sheet alike): the song the
 * store opened it for, its local-index facts, and the absolute server path.
 */
export function useSongInfoData() {
  const { songInfoModal, closeSongInfo } = usePlayerStore(
    useShallow(s => ({ songInfoModal: s.songInfoModal, closeSongInfo: s.closeSongInfo }))
  );
  const [song, setSong] = useState<SubsonicSong | null>(null);
  const [enrichment, setEnrichment] = useState<ParsedTrackEnrichment | null>(null);
  const [loading, setLoading] = useState(false);
  // Absolute filesystem path resolved via Navidrome's native API in parallel
  // with the Subsonic getSong call. Subsonic only ever returns a relative
  // path (or none on Navidrome); the native endpoint is what Feishin and the
  // Navidrome web client use to surface the full server-side location.
  const [absolutePath, setAbsolutePath] = useState<string | null>(null);

  useEffect(() => {
    if (!songInfoModal.isOpen || !songInfoModal.songId) {
      // React Compiler set-state-in-effect rule: state set from an async result resolved in this effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSong(null);
      setEnrichment(null);
      setAbsolutePath(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setEnrichment(null);
    setAbsolutePath(null);
    const songId = songInfoModal.songId;
    const ownerServerId = songInfoModal.serverId;
    void (async () => {
      const s = ownerServerId
        ? await getSongForServer(ownerServerId, songId)
        : await getSong(songId);
      if (cancelled) return;
      setSong(s);
      setLoading(false);
      if (!s) {
        setEnrichment(null);
        return;
      }
      const sid = ownerServerId ?? useAuthStore.getState().activeServerId;
      const indexEnabled = sid ? useLibraryIndexStore.getState().isIndexEnabled(sid) : false;
      if (sid && indexEnabled && await libraryIsReady(sid)) {
        try {
          const facts = await libraryGetFacts(sid, songId);
          if (!cancelled) {
            setEnrichment(parseTrackEnrichmentFacts(facts, s.bpm ?? null));
          }
        } catch {
          if (!cancelled) setEnrichment(null);
        }
      } else if (!cancelled) {
        setEnrichment(null);
      }
    })();
    // Try the native API in parallel; only when the active server is Navidrome
    // and we have credentials. Failures are silent — modal falls back to
    // whatever the Subsonic `path` field carried (typically nothing).
    const auth = useAuthStore.getState();
    const sid = ownerServerId ?? auth.activeServerId;
    const profile = sid ? auth.servers.find(p => p.id === sid) : null;
    const identity = sid ? auth.subsonicServerIdentityByServer[sid] : undefined;
    const isNavidrome = identity?.type?.trim().toLowerCase() === 'navidrome';
    if (isNavidrome && profile?.url && profile.username && profile.password) {
      const serverUrl = (profile.url.startsWith('http') ? profile.url : `http://${profile.url}`).replace(/\/$/, '');
      ndGetSongPath(serverUrl, profile.username, profile.password, songId).then(p => {
        if (!cancelled && p) setAbsolutePath(p);
      });
    }
    return () => { cancelled = true; };
  }, [songInfoModal.isOpen, songInfoModal.songId, songInfoModal.serverId]);

  return { isOpen: songInfoModal.isOpen, close: closeSongInfo, song, enrichment, loading, absolutePath };
}
