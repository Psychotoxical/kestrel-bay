import { useEffect, useState } from 'react';
import { librarySelectionForServer } from '@/lib/api/subsonicClient';
import { filterSongsToServerLibrary } from '@/lib/api/subsonicLibrary';
import { getPlaylistForServer } from '@/lib/api/subsonicPlaylists';
import type { SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import { getLuckyMixLibraryScopeOverride } from '@/lib/library/luckyMixScopeOverride';
import { useOfflineBrowseContext } from '@/features/offline';
import { ownedEntityKey } from '@/lib/util/ownedEntityKey';

export interface PlaylistsLibraryScopeCountsResult {
  filteredSongCountByPlaylist: Record<string, number>;
  filteredDurationByPlaylist: Record<string, number>;
}

/** Same scope test as `filterSongsToServerLibrary`: without a selection it returns every song. */
function libraryScopeActive(serverId: string): boolean {
  return !!getLuckyMixLibraryScopeOverride() || librarySelectionForServer(serverId).length > 0;
}

// Scoped counts per playlist revision, so revisiting the page does not fetch
// every playlist again. A playlist that changed on the server gets a new key.
const scopedCountCache = new Map<string, readonly [number, number]>();

function scopedCountKey(playlist: SubsonicPlaylist, scopeVersion: number): string {
  return [
    playlist.serverId,
    playlist.id,
    playlist.changed ?? '',
    playlist.songCount,
    scopeVersion,
    librarySelectionForServer(playlist.serverId ?? '').join(','),
  ].join('\u0000');
}

/** Test-only reset. */
export function resetPlaylistsLibraryScopeCountsCacheForTests(): void {
  scopedCountCache.clear();
}

/**
 * Song count + total duration for each playlist under the current library
 * scope. Without a library selection the server's own counts are right, so
 * nothing is fetched (the card falls back to them). With a selection, each
 * playlist is fetched once per revision, in batches of 4.
 */
export function usePlaylistsLibraryScopeCounts(
  playlists: SubsonicPlaylist[],
  musicLibraryFilterVersion: number,
): PlaylistsLibraryScopeCountsResult {
  const [filteredSongCountByPlaylist, setFilteredSongCountByPlaylist] = useState<Record<string, number>>({});
  const [filteredDurationByPlaylist, setFilteredDurationByPlaylist] = useState<Record<string, number>>({});
  const offlineBrowseActive = useOfflineBrowseContext().active;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (playlists.length === 0) {
        if (!cancelled) {
          setFilteredSongCountByPlaylist({});
          setFilteredDurationByPlaylist({});
        }
        return;
      }
      if (offlineBrowseActive) {
        const next: Record<string, number> = {};
        const nextDuration: Record<string, number> = {};
        for (const pl of playlists) {
          const key = ownedEntityKey(pl);
          next[key] = pl.songCount;
          nextDuration[key] = pl.duration;
        }
        if (!cancelled) {
          setFilteredSongCountByPlaylist(next);
          setFilteredDurationByPlaylist(nextDuration);
        }
        return;
      }
      const next: Record<string, number> = {};
      const nextDuration: Record<string, number> = {};
      const toFetch = playlists.filter((playlist) => {
        if (!playlist.serverId || !libraryScopeActive(playlist.serverId)) return false;
        const hit = scopedCountCache.get(scopedCountKey(playlist, musicLibraryFilterVersion));
        if (!hit) return true;
        const key = ownedEntityKey(playlist);
        next[key] = hit[0];
        nextDuration[key] = hit[1];
        return false;
      });
      for (let i = 0; i < toFetch.length; i += 4) {
        const chunk = toFetch.slice(i, i + 4);
        const rows = await Promise.all(
          chunk.map(async (playlist) => {
            const key = ownedEntityKey(playlist);
            try {
              if (!playlist.serverId) return [key, -1, -1] as const;
              const { songs } = await getPlaylistForServer(playlist.serverId, playlist.id);
              const filtered = await filterSongsToServerLibrary(songs, playlist.serverId);
              const duration = filtered.reduce((acc, s) => acc + (s.duration ?? 0), 0);
              scopedCountCache.set(
                scopedCountKey(playlist, musicLibraryFilterVersion),
                [filtered.length, duration],
              );
              return [key, filtered.length, duration] as const;
            } catch {
              return [key, -1, -1] as const;
            }
          }),
        );
        for (const [key, count, duration] of rows) {
          if (count >= 0) next[key] = count;
          if (duration >= 0) nextDuration[key] = duration;
        }
      }
      if (!cancelled) {
        setFilteredSongCountByPlaylist(next);
        setFilteredDurationByPlaylist(nextDuration);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [playlists, musicLibraryFilterVersion, offlineBrowseActive]);

  return { filteredSongCountByPlaylist, filteredDurationByPlaylist };
}
