import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  playTrack: vi.fn(),
  withQueueSource: vi.fn((_source: unknown, start: () => unknown) => start()),
  runLocalLiveSearch: vi.fn(),
  runNetworkLiveSearch: vi.fn(),
  resolveAlbum: vi.fn(),
  carPlayPlay: vi.fn(async () => {}),
  playlists: [] as Array<Record<string, unknown>>,
  playlistTracks: vi.fn(async () => [] as unknown[]),
}));

vi.mock('@/features/playback', () => ({
  usePlayerStore: { getState: () => ({ playTrack: mocks.playTrack }) },
  shuffleTracks: <T,>(tracks: T[]) => [...tracks].reverse(),
  withQueueSource: mocks.withQueueSource,
}));
vi.mock('@/features/playlist', () => ({
  usePlaylistStore: { getState: () => ({ playlists: mocks.playlists, fetchPlaylists: vi.fn(async () => {}) }) },
  resolvePlaylistTracks: mocks.playlistTracks,
}));
vi.mock('@/lib/library/liveSearchLocal', () => ({
  runLocalLiveSearch: mocks.runLocalLiveSearch,
  runNetworkLiveSearch: mocks.runNetworkLiveSearch,
}));
vi.mock('@/lib/library/libraryBrowseScope', () => ({ getLibraryBrowseScope: () => ({}) }));
vi.mock('@/store/mediaResolver', () => ({ resolveAlbum: mocks.resolveAlbum }));
vi.mock('@/store/authStore', () => ({ useAuthStore: { getState: () => ({ activeServerId: 'srv' }) } }));
vi.mock('./carplayContent', () => ({ carPlayPlay: mocks.carPlayPlay }));

import { playSiriRequest } from './siriPlay';

const song = (id: string, title: string, artistId = 'ar1') => ({
  id, title, artist: 'Band', artistId, album: 'Record', albumId: 'al1', duration: 200,
});

describe('playSiriRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.playlists = [];
    mocks.runLocalLiveSearch.mockResolvedValue(null);
    mocks.runNetworkLiveSearch.mockResolvedValue({ artists: [], albums: [], songs: [] });
  });

  it('a request without any name starts the random mix', async () => {
    expect(await playSiriRequest({ mediaType: 0 })).toBe(true);
    expect(mocks.carPlayPlay).toHaveBeenCalledWith('random');
  });

  it('a song request plays the matching title, followed by the other hits', async () => {
    mocks.runLocalLiveSearch.mockResolvedValue({
      artists: [], albums: [], songs: [song('t1', 'Other'), song('t2', 'Chaos')],
    });
    expect(await playSiriRequest({ mediaName: 'chaos', mediaType: 1 })).toBe(true);
    const [first, queue] = mocks.playTrack.mock.calls[0];
    expect(first.id).toBe('t2');
    expect(queue.map((t: { id: string }) => t.id)).toEqual(['t2', 't1']);
  });

  it('an album request resolves the album and plays all its tracks as that album', async () => {
    mocks.runLocalLiveSearch.mockResolvedValue({
      artists: [], albums: [{ id: 'al1', name: 'Record', artist: 'Band', serverId: 'srv' }], songs: [],
    });
    mocks.resolveAlbum.mockResolvedValue({ album: {}, songs: [song('t1', 'One'), song('t2', 'Two')] });
    expect(await playSiriRequest({ mediaName: 'Record', mediaType: 2 })).toBe(true);
    expect(mocks.withQueueSource).toHaveBeenCalledWith({ kind: 'album', id: 'al1', serverId: 'srv' }, expect.any(Function));
    expect(mocks.playTrack.mock.calls[0][1]).toHaveLength(2);
  });

  it('an artist request shuffles that artist’s songs among the hits', async () => {
    mocks.runLocalLiveSearch.mockResolvedValue({
      artists: [{ id: 'ar1', name: 'Band' }],
      albums: [],
      songs: [song('t1', 'One'), song('t2', 'Two', 'ar2'), song('t3', 'Three')],
    });
    expect(await playSiriRequest({ mediaName: 'Band', mediaType: 3 })).toBe(true);
    expect(mocks.playTrack.mock.calls[0][1].map((t: { id: string }) => t.id)).toEqual(['t3', 't1']);
  });

  it('falls back to the server search when the local index has nothing', async () => {
    mocks.runNetworkLiveSearch.mockResolvedValue({ artists: [], albums: [], songs: [song('t9', 'Chaos')] });
    expect(await playSiriRequest({ mediaName: 'Chaos', mediaType: 0 })).toBe(true);
    expect(mocks.runNetworkLiveSearch).toHaveBeenCalledWith('Chaos');
    expect(mocks.playTrack.mock.calls[0][0].id).toBe('t9');
  });

  it('a playlist request plays the playlist with that name', async () => {
    mocks.playlists = [{ id: 'p1', name: 'Road', serverId: 'srv' }];
    mocks.playlistTracks.mockResolvedValue([{ id: 't1', title: 'One' }]);
    expect(await playSiriRequest({ mediaName: 'road', mediaType: 5 })).toBe(true);
    expect(mocks.withQueueSource).toHaveBeenCalledWith({ kind: 'playlist', id: 'p1', serverId: 'srv' }, expect.any(Function));
  });

  it('reports false when nothing matches', async () => {
    expect(await playSiriRequest({ mediaName: 'Nothing here', mediaType: 0 })).toBe(false);
    expect(mocks.playTrack).not.toHaveBeenCalled();
  });
});
