import type { LibraryTrackDto } from '@/lib/api/library';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';
import type { LocalPlaybackEntry } from '@/store/localPlaybackStore';
import { useLocalPlaybackStore } from '@/store/localPlaybackStore';
import { entryBelongsToServer } from '@/store/localPlaybackResolve';
import {
  buildAlbumFromTracks,
  fetchBrowsableLocalTrackDtos,
  offlineLocalBrowseEnabled,
} from '@/features/offline';

/**
 * The albums that play from this device: every album with a track on disk
 * (downloads, offline favorites, recently played), as album cards.
 */
export type OfflinePlayableCatalog = {
  /** Albums with a downloaded track, most recent download first. */
  downloadedAlbums: SubsonicAlbum[];
  /** Albums with a played track, last played first. */
  recentlyPlayedAlbums: SubsonicAlbum[];
  /** Every album with a track on the device. */
  albums: SubsonicAlbum[];
};

/** When each downloaded (library-tier) track of this server was stored. */
function downloadedAtByTrack(
  serverId: string,
  entries: Record<string, LocalPlaybackEntry>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const entry of Object.values(entries)) {
    if (entry.tier !== 'library' || !entry.localPath || !entryBelongsToServer(entry, serverId)) continue;
    out.set(entry.trackId, Math.max(out.get(entry.trackId) ?? 0, entry.cachedAt));
  }
  return out;
}

function newestFirst(list: { album: SubsonicAlbum; at: number }[]): SubsonicAlbum[] {
  return list.sort((a, b) => b.at - a.at).map(item => item.album);
}

export function buildOfflinePlayableCatalog(
  tracksByServer: ReadonlyArray<{ serverId: string; tracks: LibraryTrackDto[] }>,
  entries: Record<string, LocalPlaybackEntry>,
): OfflinePlayableCatalog {
  const albums: SubsonicAlbum[] = [];
  const downloaded: { album: SubsonicAlbum; at: number }[] = [];
  const played: { album: SubsonicAlbum; at: number }[] = [];
  for (const { serverId, tracks } of tracksByServer) {
    const downloadedAt = downloadedAtByTrack(serverId, entries);
    const byAlbum = new Map<string, LibraryTrackDto[]>();
    for (const track of tracks) {
      if (!track.albumId) continue;
      const list = byAlbum.get(track.albumId) ?? [];
      list.push(track);
      byAlbum.set(track.albumId, list);
    }
    for (const [albumId, albumTracks] of byAlbum) {
      const album = buildAlbumFromTracks(albumId, albumTracks, serverId);
      albums.push(album);
      const storedAt = Math.max(0, ...albumTracks.map(t => downloadedAt.get(t.id) ?? 0));
      if (storedAt > 0) downloaded.push({ album, at: storedAt });
      const playedAt = Math.max(0, ...albumTracks.map(t => t.playedAt ?? 0));
      if (playedAt > 0) played.push({ album, at: playedAt });
    }
  }
  return {
    downloadedAlbums: newestFirst(downloaded),
    recentlyPlayedAlbums: newestFirst(played),
    albums,
  };
}

/** The playable catalog of these servers, read from the local library index. */
export async function loadOfflinePlayableCatalog(
  serverIds: readonly string[],
): Promise<OfflinePlayableCatalog> {
  const tracksByServer: { serverId: string; tracks: LibraryTrackDto[] }[] = [];
  // One at a time: the browsable-track cache holds a single server.
  for (const serverId of serverIds) {
    if (!offlineLocalBrowseEnabled(serverId)) continue;
    tracksByServer.push({ serverId, tracks: await fetchBrowsableLocalTrackDtos(serverId) });
  }
  return buildOfflinePlayableCatalog(tracksByServer, useLocalPlaybackStore.getState().entries);
}
