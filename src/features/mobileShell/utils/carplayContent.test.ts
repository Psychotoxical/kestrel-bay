import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';

const mocks = vi.hoisted(() => ({
  playTrack: vi.fn(),
  withQueueSource: vi.fn((_source: unknown, start: () => unknown) => start()),
  loadHomeChronologicalFeed: vi.fn(),
  resolveAlbum: vi.fn(),
  runLocalRandomSongs: vi.fn(),
  getRandomSongsForServer: vi.fn(),
  queueSongStar: vi.fn(),
  toggleShuffleMode: vi.fn(),
  toggleRepeat: vi.fn(),
  player: {} as Record<string, unknown>,
  playlists: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/features/playback', () => ({
  usePlayerStore: {
    getState: () => ({
      playTrack: mocks.playTrack,
      toggleShuffleMode: mocks.toggleShuffleMode,
      toggleRepeat: mocks.toggleRepeat,
      ...mocks.player,
    }),
    setState: vi.fn(),
  },
  queueSongStar: mocks.queueSongStar,
  resolveQueueTrack: (ref: { trackId: string }) => ({ id: ref.trackId, title: `Q ${ref.trackId}`, artist: 'Band' }),
  shuffleTracks: <T,>(tracks: T[]) => [...tracks].reverse(),
  withQueueSource: mocks.withQueueSource,
  fetchGenreCatalog: vi.fn(async () => []),
  fetchScopedGenreCatalog: vi.fn(async () => []),
}));
vi.mock('@/features/home', () => ({ loadHomeChronologicalFeed: mocks.loadHomeChronologicalFeed }));
vi.mock('@/features/playlist', () => ({
  usePlaylistStore: { getState: () => ({ playlists: mocks.playlists, fetchPlaylists: vi.fn(async () => {}) }) },
  resolvePlaylistTracks: vi.fn(async () => []),
}));
vi.mock('@/features/offline', () => ({
  buildTracksForOfflineCard: vi.fn(async () => []),
  ensureServerForOfflineCard: vi.fn(async () => true),
  hydrateOfflineLibraryCards: vi.fn(async () => []),
  isOfflineBrowseActive: () => false,
  loadArtistFromLibraryIndex: vi.fn(async () => null),
  loadStarredFromAllLibraryIndexes: vi.fn(async () => ({ artists: [], albums: [], songs: [] })),
  offlineQueueServerKeyForCard: () => 'srv',
  offlineTrackCount: () => 0,
}));
vi.mock('@/lib/library/libraryBrowseScope', async importOriginal => ({
  ...(await importOriginal<object>()),
  getLibraryBrowseScope: () => ({ anchorServerId: 'srv', serverIds: ['srv'], pairs: [{ serverId: 'srv', libraryId: null }] }),
  deriveLibraryBrowseIndexScopes: () => [],
  browseScopeLibraryIdsForServer: () => undefined,
}));
vi.mock('@/lib/library/browseTextSearch', async importOriginal => ({
  ...(await importOriginal<object>()),
  fetchLocalArtistCatalogChunk: vi.fn(async () => null),
  runLocalRandomSongs: mocks.runLocalRandomSongs,
}));
vi.mock('@/lib/api/subsonicLibrary', async importOriginal => ({ ...(await importOriginal<object>()), getRandomSongsForServer: mocks.getRandomSongsForServer }));
vi.mock('./carplayCovers', () => ({ attachCarPlayCovers: vi.fn(async () => null) }));
vi.mock('@/store/mediaResolver', async importOriginal => ({ ...(await importOriginal<object>()), resolveAlbum: mocks.resolveAlbum }));

import { carPlayCommand, carPlayList, carPlayPlay, carPlayState, _resetCarPlayContentForTest } from './carplayContent';

const song = (id: string): SubsonicSong => ({
  id, title: `Song ${id}`, artist: 'Band', album: 'Record', albumId: 'al1', duration: 200,
});

describe('carplayContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCarPlayContentForTest();
    mocks.player = {};
    mocks.playlists = [];
  });

  it('playlist rows carry their cover source only when the playlist has a cover', async () => {
    mocks.playlists = [
      { id: 'p1', name: 'Road', songCount: 12, coverArt: 'pl-p1', serverId: 'srv' },
      { id: 'p2', name: 'Bare', songCount: 3 },
    ];
    const list = await carPlayList('playlists');
    const [withCover, without] = list.sections[0].items;
    expect(withCover.cover).toEqual({ kind: 'playlist', id: 'p1', coverArt: 'pl-p1', serverId: 'srv' });
    expect(without.cover).toBeUndefined();
  });

  it('up next lists the queue from the playing track and a row jumps there', async () => {
    mocks.player = {
      queueIndex: 1,
      queueItems: [{ trackId: 'a' }, { trackId: 'b' }, { trackId: 'c' }],
    };
    const list = await carPlayList('queue');
    expect(list.sections[0].items.map(item => item.title)).toEqual(['Q b', 'Q c']);
    await carPlayPlay(list.sections[0].items[1].node);
    const [track, queue, , , index] = mocks.playTrack.mock.calls[0];
    expect(track.id).toBe('c');
    expect(queue).toBeUndefined();
    expect(index).toBe(2);
  });

  it('the buttons toggle shuffle and repeat and star the playing track', () => {
    mocks.player = { currentTrack: { id: 't1', serverId: 'srv', starred: undefined }, starredOverrides: {} };
    carPlayCommand('shuffle');
    carPlayCommand('repeat');
    carPlayCommand('star');
    expect(mocks.toggleShuffleMode).toHaveBeenCalledOnce();
    expect(mocks.toggleRepeat).toHaveBeenCalledOnce();
    expect(mocks.queueSongStar).toHaveBeenCalledWith('t1', true, 'srv');
  });

  it('reports shuffle, repeat and favourite state for the buttons', () => {
    mocks.player = {
      currentTrack: { id: 't1', album: 'Record', starred: '2026-01-01' },
      shuffleMode: true,
      repeatMode: 'one',
      starredOverrides: {},
    };
    expect(carPlayState()).toMatchObject({ shuffle: true, repeat: 'one', starred: true, hasTrack: true, albumTitle: 'Record' });
  });

  it('offers the four tabs in the native tab order', async () => {
    const list = await carPlayList('tabs');
    expect(list.sections[0].items.map(item => item.node)).toEqual(['home', 'playlists', 'library', 'downloads']);
    expect(list.sections[0].items.every(item => item.browse)).toBe(true);
  });

  it('home lists recently played albums from the local feed, then the mix rows', async () => {
    mocks.loadHomeChronologicalFeed.mockResolvedValue({
      status: 'success', hasMore: false, durationMs: 1,
      albums: [{ id: 'al1', name: 'Record', artist: 'Band', artistId: 'ar1', songCount: 2, duration: 400, serverId: 'srv' }],
    });
    const list = await carPlayList('home');
    expect(mocks.loadHomeChronologicalFeed).toHaveBeenCalledWith(expect.objectContaining({ feed: 'recentlyPlayed', anchorServerId: 'srv' }));
    expect(list.sections[0].items[0]).toMatchObject({ node: 'album|srv|al1', title: 'Record', browse: true });
    expect(list.sections[1].items.map(item => item.node)).toEqual(['random', 'favorites']);
  });

  it('the album/artist button lists the artist as a row that opens their albums, then the album', async () => {
    mocks.player = { currentTrack: { id: 't1', title: 'One', artist: 'Band', artistId: 'ar1', albumId: 'al1', serverId: 'srv' } };
    mocks.resolveAlbum.mockResolvedValue({ album: {}, songs: [song('t1')] });
    const list = await carPlayList('current');
    expect(list.sections[0].items).toEqual([
      expect.objectContaining({ node: 'artist|srv|ar1', title: 'Band', browse: true, cover: { kind: 'artist', id: 'ar1', serverId: 'srv' } }),
    ]);
    // The album's play all / shuffle / tracks follow.
    expect(list.sections[1].items.map(item => item.node)[0]).toContain('playall');
  });

  it('without an artist id the button shows just the album', async () => {
    mocks.player = { currentTrack: { id: 't1', title: 'One', artist: 'Band', albumId: 'al1', serverId: 'srv' } };
    mocks.resolveAlbum.mockResolvedValue({ album: {}, songs: [song('t1')] });
    const list = await carPlayList('current');
    expect(list.sections[0].items[0].node).toContain('playall');
  });

  it('an album lists play all, shuffle and its tracks; a track row plays the album from there', async () => {
    mocks.resolveAlbum.mockResolvedValue({ album: {}, songs: [song('t1'), song('t2'), song('t3')] });
    const list = await carPlayList('album|srv|al1');
    const [actions, tracks] = list.sections;
    expect(actions.items.map(item => item.node)).toEqual(['playall|album%7Csrv%7Cal1', 'shuffle|album%7Csrv%7Cal1']);
    expect(tracks.items).toHaveLength(3);

    await carPlayPlay(tracks.items[1].node);
    expect(mocks.withQueueSource).toHaveBeenCalledWith({ kind: 'album', id: 'al1', serverId: 'srv' }, expect.any(Function));
    const [track, queue, , , index] = mocks.playTrack.mock.calls[0];
    expect(track.id).toBe('t2');
    expect(queue.map((t: { id: string }) => t.id)).toEqual(['t1', 't2', 't3']);
    expect(index).toBe(1);
  });

  it('shuffle plays the listed tracks in shuffled order without a queue source', async () => {
    mocks.resolveAlbum.mockResolvedValue({ album: {}, songs: [song('t1'), song('t2')] });
    const list = await carPlayList('album|srv|al1');
    await carPlayPlay(list.sections[0].items[1].node);
    expect(mocks.withQueueSource).not.toHaveBeenCalled();
    expect(mocks.playTrack.mock.calls[0][0].id).toBe('t2');
  });

  it('the random mix prefers the local index and falls back to the server', async () => {
    mocks.runLocalRandomSongs.mockResolvedValueOnce([song('r1')]);
    await carPlayPlay('random');
    expect(mocks.getRandomSongsForServer).not.toHaveBeenCalled();
    expect(mocks.playTrack.mock.calls[0][0].id).toBe('r1');

    mocks.runLocalRandomSongs.mockResolvedValueOnce(null);
    mocks.getRandomSongsForServer.mockResolvedValueOnce([song('n1')]);
    await carPlayPlay('random');
    expect(mocks.playTrack.mock.calls[1][0].id).toBe('n1');
  });

  it('an unknown or stale row plays nothing', async () => {
    await carPlayPlay('track|album%7Csrv%7Cgone|0');
    await carPlayPlay('nonsense');
    expect(mocks.playTrack).not.toHaveBeenCalled();
  });
});
