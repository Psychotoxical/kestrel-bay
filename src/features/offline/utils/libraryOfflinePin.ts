import { libraryGetTracksByAlbum, subscribeLibrarySyncIdle } from '@/lib/api/library';
import { libraryScopeBrowse, libraryScopeListAlbums, libraryScopeStatistics } from '@/lib/api/library/scopeReads';
import { getMediaFreeSpace } from '@/lib/api/syncfs';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { trackToSong } from '@/lib/library/trackDtoMapping';
import { getMediaDir } from '@/lib/media/mediaDir';
import { isActiveServerReachable, onActiveServerBecameReachable } from '@/lib/network/activeServerReachability';
import { resolveServerIdForIndexKey } from '@/lib/server/serverLookup';
import { showToast } from '@/lib/dom/toast';
import i18n from '@/lib/i18n';
import { useLocalPlaybackStore, type PinSource } from '@/store/localPlaybackStore';
import { registerOfflineDiskFullHandler, useOfflineStore } from '@/features/offline/store/offlineStore';
import { useOfflineJobStore } from '@/features/offline/store/offlineJobStore';
import {
  pinnedLibraryKey,
  useOfflineLibraryPinStore,
  type PinnedLibrary,
} from '@/features/offline/store/offlineLibraryPinStore';
import { isOfflinePinComplete } from '@/features/offline/utils/offlineLibraryHelpers';
import { enqueueOfflinePin, removeOfflinePinTask } from '@/features/offline/utils/offlinePinQueue';

/** Albums of one library pin allowed in the download queue at a time. */
const LIBRARY_QUEUE_DEPTH = 2;
const ALBUM_PAGE = 500;
const TRACK_PAGE = 200;

export interface LibraryDownloadEstimate {
  trackCount: number;
  totalBytes: number;
  /** Bytes the device can still take for downloads (reserve already off). */
  freeBytes: number | null;
}

function libraryPin(albumId: string): PinSource {
  return { kind: 'library', sourceId: albumId };
}

/** Tracks read for the bytes-per-second sample of a library. */
const SIZE_SAMPLE_TRACKS = 1000;

/**
 * Track count and size of a library from the local index, plus the free space
 * left for downloads. Count and play time come from one statistics read; the
 * size is play time times the bytes per second of the first
 * {@link SIZE_SAMPLE_TRACKS} tracks, and exact when those are all of them.
 * (Reading every track took ~9 minutes for 150,000 tracks on a Galaxy S22.)
 */
export async function estimateLibraryDownload(
  serverId: string,
  libraryId: string,
): Promise<LibraryDownloadEstimate> {
  const stats = await libraryScopeStatistics([{ serverId, libraryIds: [libraryId] }]);
  let sampleTracks = 0;
  let sampleBytes = 0;
  let sampleSeconds = 0;
  let cursor: string | null | undefined;
  do {
    const page = await libraryScopeBrowse(serverId, {
      entity: 'track',
      scopes: [{ serverId, libraryId }],
      limit: TRACK_PAGE,
      cursor,
    });
    for (const track of page.tracks) {
      sampleTracks += 1;
      if (track.sizeBytes && track.sizeBytes > 0 && track.durationSec > 0) {
        sampleBytes += track.sizeBytes;
        sampleSeconds += track.durationSec;
      }
    }
    cursor = page.hasMore && sampleTracks < SIZE_SAMPLE_TRACKS ? page.nextCursor : null;
  } while (cursor);
  const trackCount = Math.max(stats.songCount, sampleTracks);
  const totalBytes = sampleTracks >= trackCount
    ? sampleBytes
    : Math.round(stats.playtimeSec * (sampleSeconds > 0 ? sampleBytes / sampleSeconds : 0));
  const freeBytes = await getMediaFreeSpace({ mediaDir: getMediaDir() }).catch(() => null);
  return { trackCount, totalBytes, freeBytes };
}

/** Album ids of a library in the local index, page by page. */
async function* libraryAlbums(serverId: string, libraryId: string) {
  for (let offset = 0; ; offset += ALBUM_PAGE) {
    const page = await libraryScopeListAlbums(serverId, {
      scopes: [{ serverId, libraryId }],
      limit: ALBUM_PAGE,
      offset,
    });
    yield* page;
    if (page.length < ALBUM_PAGE) return;
  }
}

async function libraryAlbumSongs(serverId: string, libraryId: string, albumId: string): Promise<SubsonicSong[]> {
  const tracks = await libraryGetTracksByAlbum(serverId, albumId).catch(() => []);
  return tracks.filter(track => track.libraryId === libraryId).map(trackToSong);
}

function queuedLibraryTasks(serverId: string): number {
  return useOfflineJobStore.getState().pinQueue
    .filter(entry => entry.pinKind === 'library' && entry.serverId === serverId).length;
}

/** Resolves once the queue has room for another album of this server, or the pass stops. */
function waitForQueueRoom(serverId: string, isCurrent: () => boolean): Promise<void> {
  if (queuedLibraryTasks(serverId) < LIBRARY_QUEUE_DEPTH || !isCurrent()) return Promise.resolve();
  return new Promise(resolve => {
    const poll = setInterval(() => {
      if (queuedLibraryTasks(serverId) < LIBRARY_QUEUE_DEPTH || !isCurrent()) {
        clearInterval(poll);
        unsubscribe();
        resolve();
      }
    }, 5000);
    const unsubscribe = useOfflineJobStore.subscribe(() => {
      if (queuedLibraryTasks(serverId) >= LIBRARY_QUEUE_DEPTH && isCurrent()) return;
      clearInterval(poll);
      unsubscribe();
      resolve();
    });
  });
}

/** Album ids per library pin, from the last finished pass. */
const libraryAlbumIds = new Map<string, Set<string>>();
const passGenerations = new Map<string, number>();
let nextPassGeneration = 1;

function isPinActive(serverId: string, libraryId: string): boolean {
  const pin = useOfflineLibraryPinStore.getState().libraries[pinnedLibraryKey(serverId, libraryId)];
  return !!pin && !pin.pausedForSpace;
}

/** Album ids last seen in a pinned library; undefined before the first pass. */
export function pinnedLibraryAlbumIds(serverId: string, libraryId: string): Set<string> | undefined {
  return libraryAlbumIds.get(pinnedLibraryKey(serverId, libraryId));
}

/**
 * Drop one album's library download. A failure is logged and does not stop
 * the caller's loop: one album that cannot be deleted must not leave all the
 * later ones on the disk.
 */
async function deleteLibraryAlbum(albumId: string, serverId: string, pin: PinSource): Promise<void> {
  try {
    await useOfflineStore.getState().deleteAlbum(albumId, serverId, pin);
  } catch (error) {
    console.error('[offline] removing a library album failed', { serverId, albumId, error });
  }
}

/**
 * One pass over a pinned library: queue every album that is not complete yet,
 * at most {@link LIBRARY_QUEUE_DEPTH} at a time, and drop downloads of albums
 * that left the library. A newer pass for the same library stops this one.
 */
async function runLibraryPass(serverId: string, libraryId: string): Promise<void> {
  const key = pinnedLibraryKey(serverId, libraryId);
  const generation = nextPassGeneration++;
  passGenerations.set(key, generation);
  const isCurrent = () => passGenerations.get(key) === generation && isPinActive(serverId, libraryId);

  const seen = new Set<string>();
  for await (const album of libraryAlbums(serverId, libraryId)) {
    if (!isCurrent()) return;
    seen.add(album.id);
    const songs = await libraryAlbumSongs(serverId, libraryId, album.id);
    if (!isCurrent()) return;
    if (songs.length === 0) continue;
    const pin = libraryPin(album.id);
    if (isOfflinePinComplete(album.id, serverId, songs.map(song => song.id), pin)) continue;
    // Queued under another pin right now (the queue keys albums, not pins):
    // leave it to that pin; the next pass adds the library pin to its tracks.
    if (useOfflineStore.getState().isAlbumDownloading(album.id, serverId)) continue;
    await waitForQueueRoom(serverId, isCurrent);
    if (!isCurrent()) return;
    enqueueOfflinePin({
      albumId: album.id,
      albumName: album.name,
      albumArtist: album.artist ?? '',
      coverArt: album.coverArtId ?? undefined,
      year: album.year ?? undefined,
      songs,
      serverId,
      type: 'library',
    });
  }
  if (!isCurrent()) return;
  libraryAlbumIds.set(key, seen);

  // Only one library of this server pinned: every library download outside it is stale.
  const otherPins = Object.values(useOfflineLibraryPinStore.getState().libraries)
    .filter(other => other.serverId === serverId && other.libraryId !== libraryId);
  if (otherPins.length > 0) return;
  for (const group of useLocalPlaybackStore.getState().listPinnedGroups()) {
    if (!isCurrent()) return;
    if (group.pinSource.kind !== 'library' || seen.has(group.pinSource.sourceId)) continue;
    if ((resolveServerIdForIndexKey(group.serverIndexKey) || group.serverIndexKey) !== serverId) continue;
    await deleteLibraryAlbum(group.pinSource.sourceId, serverId, group.pinSource);
  }
}

export function startLibraryPass(serverId: string, libraryId: string): void {
  if (!isActiveServerReachable() || !isPinActive(serverId, libraryId)) return;
  void runLibraryPass(serverId, libraryId).catch(error => {
    console.error('[offline] library pass failed', { serverId, libraryId, error });
  });
}

/** Pin a whole library and start downloading it. */
export function pinLibraryOffline(
  library: Omit<PinnedLibrary, 'pinnedAt' | 'pausedForSpace'>,
): void {
  useOfflineLibraryPinStore.getState().addLibrary({ ...library, pinnedAt: Date.now() });
  startLibraryPass(library.serverId, library.libraryId);
}

/** Resume a library pin that stopped because the disk was full. */
export function resumeLibraryPin(serverId: string, libraryId: string): void {
  useOfflineLibraryPinStore.getState().patchLibrary(serverId, libraryId, { pausedForSpace: false });
  startLibraryPass(serverId, libraryId);
}

/** Stop a library pin and delete what it downloaded (files other pins share stay). */
export async function unpinLibraryOffline(serverId: string, libraryId: string): Promise<void> {
  const key = pinnedLibraryKey(serverId, libraryId);
  useOfflineLibraryPinStore.getState().removeLibrary(serverId, libraryId);
  passGenerations.delete(key);

  const albumIds = new Set(libraryAlbumIds.get(key) ?? []);
  try {
    for await (const album of libraryAlbums(serverId, libraryId)) albumIds.add(album.id);
  } catch (error) {
    // The orphan sweep below still removes what the album list missed.
    console.error('[offline] listing a removed library failed', { serverId, libraryId, error });
  }
  libraryAlbumIds.delete(key);

  for (const entry of useOfflineJobStore.getState().pinQueue) {
    if (entry.pinKind === 'library' && entry.serverId === serverId && albumIds.has(entry.albumId)) {
      useOfflineJobStore.getState().cancelDownload(entry.albumId, serverId, 'library');
      removeOfflinePinTask(entry.albumId, serverId, 'library');
    }
  }
  for (const group of useLocalPlaybackStore.getState().listPinnedGroups()) {
    if (group.pinSource.kind !== 'library' || !albumIds.has(group.pinSource.sourceId)) continue;
    if ((resolveServerIdForIndexKey(group.serverIndexKey) || group.serverIndexKey) !== serverId) continue;
    await deleteLibraryAlbum(group.pinSource.sourceId, serverId, group.pinSource);
  }
  // A removal that stopped half-way (S22, 25.10.: 157 of ~460 files, cause not
  // reproduced) left the rest until the next start; sweep right away instead.
  await removeOrphanLibraryDownloads();
}

/**
 * The disk filled up during a library download: stop every library pin of
 * that server, take its queued albums out, and say so once.
 */
export function pauseLibraryPinsForFullDisk(serverId: string): void {
  const store = useOfflineLibraryPinStore.getState();
  const pins = Object.values(store.libraries)
    .filter(pin => pin.serverId === serverId && !pin.pausedForSpace);
  if (pins.length === 0) return;
  for (const pin of pins) store.patchLibrary(pin.serverId, pin.libraryId, { pausedForSpace: true });
  for (const entry of useOfflineJobStore.getState().pinQueue) {
    if (entry.pinKind !== 'library' || entry.serverId !== serverId) continue;
    useOfflineJobStore.getState().cancelDownload(entry.albumId, serverId, 'library');
    removeOfflinePinTask(entry.albumId, serverId, 'library');
  }
  showToast(i18n.t('connection.libraryDownloadDiskFull'), 8000, 'error');
}

/**
 * Library downloads of a server with no library pin left, e.g. when the app
 * closed while a removal was still deleting. The Downloaded page lists none of
 * them, so nothing else would ever clean them up.
 */
async function removeOrphanLibraryDownloads(): Promise<void> {
  const pinnedServers = new Set(
    Object.values(useOfflineLibraryPinStore.getState().libraries).map(pin => pin.serverId),
  );
  for (const group of useLocalPlaybackStore.getState().listPinnedGroups()) {
    if (group.pinSource.kind !== 'library') continue;
    const serverId = resolveServerIdForIndexKey(group.serverIndexKey) || group.serverIndexKey;
    if (pinnedServers.has(serverId)) continue;
    await deleteLibraryAlbum(group.pinSource.sourceId, serverId, group.pinSource);
  }
}

function startAllLibraryPasses(serverId?: string): void {
  for (const pin of Object.values(useOfflineLibraryPinStore.getState().libraries)) {
    if (serverId && pin.serverId !== serverId) continue;
    startLibraryPass(pin.serverId, pin.libraryId);
  }
}

/**
 * Keep pinned libraries complete: a pass on start, when the server becomes
 * reachable, and after each library sync (new albums arrive that way).
 */
export function initLibraryOfflinePins(): () => void {
  let disposed = false;
  let stopLibraryIdle: (() => void) | null = null;
  void subscribeLibrarySyncIdle(payload => {
    if (disposed || !payload.ok) return;
    if (payload.kind !== 'initial_sync' && payload.kind !== 'delta_sync') return;
    startAllLibraryPasses(resolveServerIdForIndexKey(payload.serverId) || payload.serverId);
  }).then(unlisten => {
    if (disposed) unlisten();
    else stopLibraryIdle = unlisten;
  });
  const stopReachable = onActiveServerBecameReachable(() => {
    if (!disposed) startAllLibraryPasses();
  });
  void removeOrphanLibraryDownloads().catch(error => {
    console.error('[offline] removing orphaned library downloads failed', error);
  });
  startAllLibraryPasses();
  return () => {
    disposed = true;
    passGenerations.clear();
    stopLibraryIdle?.();
    stopReachable();
  };
}

registerOfflineDiskFullHandler(pauseLibraryPinsForFullDisk);
