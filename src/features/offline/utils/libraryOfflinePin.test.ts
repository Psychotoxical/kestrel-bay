import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryAlbumDto, LibraryTrackDto } from '@/lib/api/library';
import { useOfflineJobStore } from '@/features/offline/store/offlineJobStore';
import { useOfflineStore } from '@/features/offline/store/offlineStore';
import { useOfflineLibraryPinStore, pinnedLibraryKey } from '@/features/offline/store/offlineLibraryPinStore';
import { useLocalPlaybackStore } from '@/store/localPlaybackStore';
import type { OfflinePinTask } from '@/features/offline/utils/offlinePinQueue';

const albumsByLibrary = new Map<string, LibraryAlbumDto[]>();
const tracksByAlbum = new Map<string, Partial<LibraryTrackDto>[]>();
const trackPages: Partial<LibraryTrackDto>[][] = [];
const libraryStats = { songCount: 0, playtimeSec: 0 };
const enqueued: OfflinePinTask[] = [];
const completeAlbums = new Set<string>();
const toasts: string[] = [];

vi.mock('@/lib/api/library', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api/library')>()),
  libraryGetTracksByAlbum: vi.fn(async (_serverId: string, albumId: string) => tracksByAlbum.get(albumId) ?? []),
  subscribeLibrarySyncIdle: vi.fn(async () => () => {}),
}));
vi.mock('@/lib/api/library/scopeReads', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api/library/scopeReads')>()),
  libraryScopeListAlbums: vi.fn(async (_serverId: string, request: { scopes: { libraryId: string | null }[]; offset?: number }) => {
    const all = albumsByLibrary.get(request.scopes[0].libraryId ?? '') ?? [];
    return all.slice(request.offset ?? 0, (request.offset ?? 0) + 500);
  }),
  libraryScopeStatistics: vi.fn(async () => ({ ...libraryStats, artistCount: 0, albumCount: 0, genres: [], formats: [] })),
  libraryScopeBrowse: vi.fn(async (_serverId: string, request: { cursor?: string | null }) => {
    const index = request.cursor ? Number(request.cursor) : 0;
    const hasMore = index + 1 < trackPages.length;
    return {
      albums: [], artists: [], tracks: trackPages[index] ?? [],
      hasMore, nextCursor: hasMore ? String(index + 1) : null, source: 'local',
    };
  }),
}));
vi.mock('@/lib/api/syncfs', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api/syncfs')>()),
  getMediaFreeSpace: vi.fn(async () => 5_000),
}));
vi.mock('@/lib/network/activeServerReachability', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/network/activeServerReachability')>()),
  isActiveServerReachable: () => true,
}));
vi.mock('@/lib/dom/toast', () => ({ showToast: (message: string) => { toasts.push(message); } }));
vi.mock('@/features/offline/utils/offlineLibraryHelpers', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline/utils/offlineLibraryHelpers')>()),
  isOfflinePinComplete: (albumId: string) => completeAlbums.has(albumId),
}));
vi.mock('@/features/offline/utils/offlinePinQueue', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline/utils/offlinePinQueue')>()),
  enqueueOfflinePin: (task: OfflinePinTask) => {
    enqueued.push(task);
    useOfflineJobStore.setState(state => ({
      pinQueue: [...state.pinQueue, {
        albumId: task.albumId, albumName: task.albumName, pinKind: task.type,
        status: 'queued' as const, queuedAt: Date.now(), serverId: task.serverId,
      }],
    }));
    return true;
  },
}));

const {
  estimateLibraryDownload,
  pauseLibraryPinsForFullDisk,
  pinLibraryOffline,
  unpinLibraryOffline,
} = await import('@/features/offline/utils/libraryOfflinePin');

function album(id: string): LibraryAlbumDto {
  return { serverId: 'srv', id, name: id, artist: 'A', syncedAt: 0, rawJson: {} };
}

function track(id: string, albumId: string, libraryId: string, sizeBytes?: number): Partial<LibraryTrackDto> {
  return { serverId: 'srv', id, title: id, albumId, libraryId, sizeBytes, durationSec: 1 };
}

const settle = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });

function finishQueued(): void {
  useOfflineJobStore.setState({ pinQueue: [] });
}

describe('whole-library offline pins', () => {
  beforeEach(() => {
    albumsByLibrary.clear();
    tracksByAlbum.clear();
    trackPages.length = 0;
    enqueued.length = 0;
    completeAlbums.clear();
    toasts.length = 0;
    useOfflineJobStore.setState({ jobs: [], pinQueue: [], bulkProgress: {} });
    useOfflineLibraryPinStore.setState({ libraries: {} });
    useLocalPlaybackStore.setState({ entries: {} });
  });

  it('adds up the exact size when the sample covers the whole library', async () => {
    libraryStats.songCount = 3;
    libraryStats.playtimeSec = 30;
    trackPages.push(
      [track('t1', 'a1', 'lib', 100), track('t2', 'a1', 'lib', 300)],
      [track('t3', 'a2', 'lib', 200)],
    );

    const estimate = await estimateLibraryDownload('srv', 'lib');

    expect(estimate).toEqual({ trackCount: 3, totalBytes: 600, freeBytes: 5_000 });
  });

  it('scales a sample of a large library by its play time', async () => {
    libraryStats.songCount = 100_000;
    libraryStats.playtimeSec = 1_000_000;
    // 1000 sampled tracks of 10 s and 1000 bytes each: 100 bytes per second.
    for (let page = 0; page < 6; page += 1) {
      trackPages.push(Array.from({ length: 200 }, (_, i) => ({
        ...track(`t${page}-${i}`, 'a1', 'lib', 1000), durationSec: 10,
      })));
    }

    const estimate = await estimateLibraryDownload('srv', 'lib');

    expect(estimate).toEqual({ trackCount: 100_000, totalBytes: 100_000_000, freeBytes: 5_000 });
  });

  it('feeds two albums at a time, skips complete ones and tracks of other libraries', async () => {
    albumsByLibrary.set('lib', ['a1', 'a2', 'a3', 'a4'].map(album));
    tracksByAlbum.set('a1', [track('t1', 'a1', 'lib'), track('x1', 'a1', 'other')]);
    tracksByAlbum.set('a2', [track('t2', 'a2', 'lib')]);
    tracksByAlbum.set('a3', [track('t3', 'a3', 'lib')]);
    tracksByAlbum.set('a4', [track('t4', 'a4', 'lib')]);
    completeAlbums.add('a2');

    pinLibraryOffline({ serverId: 'srv', libraryId: 'lib', name: 'Music', trackCount: 4, totalBytes: 4 });
    await settle();
    await settle();

    expect(enqueued.map(task => task.albumId)).toEqual(['a1', 'a3']);
    expect(enqueued[0].songs.map(song => song.id)).toEqual(['t1']);
    expect(enqueued.every(task => task.type === 'library')).toBe(true);

    finishQueued();
    await settle();
    await settle();
    expect(enqueued.map(task => task.albumId)).toEqual(['a1', 'a3', 'a4']);
  });

  it('stops a library pin once when the disk is full', async () => {
    albumsByLibrary.set('lib', ['a1', 'a2', 'a3'].map(album));
    for (const id of ['a1', 'a2', 'a3']) tracksByAlbum.set(id, [track(`t-${id}`, id, 'lib')]);
    pinLibraryOffline({ serverId: 'srv', libraryId: 'lib', name: 'Music', trackCount: 3, totalBytes: 3 });
    await settle();
    await settle();
    expect(useOfflineJobStore.getState().pinQueue).toHaveLength(2);

    pauseLibraryPinsForFullDisk('srv');
    pauseLibraryPinsForFullDisk('srv');
    await settle();

    const pin = useOfflineLibraryPinStore.getState().libraries[pinnedLibraryKey('srv', 'lib')];
    expect(pin.pausedForSpace).toBe(true);
    expect(useOfflineJobStore.getState().pinQueue).toHaveLength(0);
    expect(toasts).toHaveLength(1);
    await settle();
    expect(enqueued.map(task => task.albumId)).toEqual(['a1', 'a2']);
  });

  it('removing a library pin deletes its albums’ library downloads only', async () => {
    albumsByLibrary.set('lib', ['a1'].map(album));
    useOfflineLibraryPinStore.getState().addLibrary({
      serverId: 'srv', libraryId: 'lib', name: 'Music', pinnedAt: 0, trackCount: 1, totalBytes: 1, pausedForSpace: true,
    });
    const entry = (trackId: string, sourceId: string, kind: 'library' | 'album') => ({
      serverIndexKey: 'srv', trackId, localPath: `/m/${trackId}`, tier: 'library' as const,
      pinSource: { kind, sourceId }, suffix: 'flac', cachedAt: 0, sizeBytes: 1, layoutFingerprint: 'v2',
    });
    useLocalPlaybackStore.setState({
      entries: {
        'srv:t1': entry('t1', 'a1', 'library'),
        'srv:t9': entry('t9', 'a9', 'album'),
      },
    });
    const deleteAlbum = vi.fn(async () => {});
    useOfflineStore.setState({ deleteAlbum });

    await unpinLibraryOffline('srv', 'lib');

    expect(useOfflineLibraryPinStore.getState().libraries).toEqual({});
    // The mock leaves the entries in place, so the sweep after the removal meets a1 again.
    expect(deleteAlbum).toHaveBeenCalledWith('a1', 'srv', { kind: 'library', sourceId: 'a1' });
    expect(deleteAlbum.mock.calls.every(call => (call as unknown[])[0] === 'a1')).toBe(true);
  });
  it('keeps removing after one album fails and sweeps what the album list missed', async () => {
    albumsByLibrary.set('lib', ['a1', 'a2'].map(album));
    useOfflineLibraryPinStore.getState().addLibrary({
      serverId: 'srv', libraryId: 'lib', name: 'Music', pinnedAt: 0, trackCount: 3, totalBytes: 3, pausedForSpace: true,
    });
    const entry = (trackId: string, sourceId: string) => ({
      serverIndexKey: 'srv', trackId, localPath: `/m/${trackId}`, tier: 'library' as const,
      pinSource: { kind: 'library' as const, sourceId }, suffix: 'flac', cachedAt: 0, sizeBytes: 1, layoutFingerprint: 'v2',
    });
    useLocalPlaybackStore.setState({
      entries: { 'srv:t1': entry('t1', 'a1'), 'srv:t2': entry('t2', 'a2'), 'srv:t3': entry('t3', 'gone') },
    });
    const deleteAlbum = vi.fn(async (albumId: string) => {
      if (albumId === 'a1') throw new Error('stuck');
    });
    useOfflineStore.setState({ deleteAlbum });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await unpinLibraryOffline('srv', 'lib');

    const removed = deleteAlbum.mock.calls.map(call => call[0]);
    expect(removed).toContain('a2');
    expect(removed).toContain('gone');
  });
});
