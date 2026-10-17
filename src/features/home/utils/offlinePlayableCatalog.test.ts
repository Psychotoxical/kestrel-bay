import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LibraryTrackDto } from '@/lib/api/library';
import { useAuthStore } from '@/store/authStore';
import { useLibraryIndexStore } from '@/store/libraryIndexStore';
import { useLocalPlaybackStore, type LocalPlaybackEntry } from '@/store/localPlaybackStore';
import { resetBrowsableLocalTrackCacheForTests } from '@/features/offline';
import {
  buildOfflinePlayableCatalog,
  loadOfflinePlayableCatalog,
} from '@/features/home/utils/offlinePlayableCatalog';

const { libraryGetTracksBatchChunkedMock } = vi.hoisted(() => ({
  libraryGetTracksBatchChunkedMock: vi.fn(async (): Promise<LibraryTrackDto[]> => []),
}));

vi.mock('@/lib/api/library', () => ({
  libraryGetTracksBatchChunked: libraryGetTracksBatchChunkedMock,
  libraryGetTracksByAlbum: vi.fn(async () => []),
  libraryAdvancedSearch: vi.fn(),
  libraryListStarred: vi.fn(async () => ({ artists: [], albums: [], tracks: [] })),
  subscribeLibrarySyncIdle: vi.fn(async () => () => {}),
}));

function track(id: string, albumId: string, playedAt: number | null = null): LibraryTrackDto {
  return {
    serverId: 'srv-a',
    id,
    title: `Track ${id}`,
    artist: 'Kaltfront',
    artistId: 'ar1',
    album: `Album ${albumId}`,
    albumId,
    durationSec: 40,
    playedAt,
    syncedAt: 0,
    rawJson: {},
  };
}

function entry(trackId: string, tier: LocalPlaybackEntry['tier'], cachedAt: number): LocalPlaybackEntry {
  return {
    serverIndexKey: 'a.test',
    trackId,
    localPath: `/media/${tier}/${trackId}.mp3`,
    layoutFingerprint: 'fp',
    sizeBytes: 1,
    tier,
    cachedAt,
    suffix: 'mp3',
  };
}

const entriesOf = (...list: LocalPlaybackEntry[]) =>
  Object.fromEntries(list.map(e => [`${e.serverIndexKey}:${e.trackId}`, e]));

describe('offline playable catalog', () => {
  beforeEach(() => {
    useAuthStore.setState({
      activeServerId: 'srv-a',
      servers: [{ id: 'srv-a', name: 'A', url: 'https://a.test', username: 'u', password: 'p' }],
    });
    useLibraryIndexStore.setState({ masterEnabled: true });
    useLocalPlaybackStore.setState({ entries: {} });
    resetBrowsableLocalTrackCacheForTests();
    libraryGetTracksBatchChunkedMock.mockReset().mockResolvedValue([]);
  });

  it('lists downloads newest first and leaves cached-only albums out of them', () => {
    const catalog = buildOfflinePlayableCatalog(
      [{ serverId: 'srv-a', tracks: [track('t1', 'old'), track('t2', 'new'), track('t3', 'cached')] }],
      entriesOf(entry('t1', 'library', 10), entry('t2', 'library', 20), entry('t3', 'ephemeral', 30)),
    );
    expect(catalog.downloadedAlbums.map(a => a.id)).toEqual(['new', 'old']);
    expect(catalog.albums.map(a => a.id).sort()).toEqual(['cached', 'new', 'old']);
  });

  it('orders recently played by the last played track and skips unplayed albums', () => {
    const catalog = buildOfflinePlayableCatalog(
      [{
        serverId: 'srv-a',
        tracks: [track('t1', 'a', 100), track('t2', 'a', 500), track('t3', 'b', 300), track('t4', 'c')],
      }],
      {},
    );
    expect(catalog.recentlyPlayedAlbums.map(a => a.id)).toEqual(['a', 'b']);
  });

  it('reads the tracks on the device from the local index', async () => {
    useLocalPlaybackStore.setState({ entries: entriesOf(entry('t1', 'library', 10)) });
    libraryGetTracksBatchChunkedMock.mockResolvedValue([track('t1', 'al1', 50)]);
    const catalog = await loadOfflinePlayableCatalog(['srv-a']);
    expect(catalog.downloadedAlbums).toEqual([expect.objectContaining({ id: 'al1', serverId: 'srv-a' })]);
    expect(catalog.recentlyPlayedAlbums.map(a => a.id)).toEqual(['al1']);
  });

  it('is empty for a server with nothing on the device', async () => {
    const catalog = await loadOfflinePlayableCatalog(['srv-a']);
    expect(catalog).toEqual({ downloadedAlbums: [], recentlyPlayedAlbums: [], albums: [] });
    expect(libraryGetTracksBatchChunkedMock).not.toHaveBeenCalled();
  });
});
