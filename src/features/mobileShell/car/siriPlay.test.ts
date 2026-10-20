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

import { normalizeSpoken, playSiriRequest, spokenMatchScore, stripSpokenAppName } from './siriPlay';

describe('stripSpokenAppName', () => {
  it('drops a trailing app name or its mishearing, in German and English', () => {
    expect(stripSpokenAppName('Metallica and Justice for All mit Psychic')).toBe('Metallica and Justice for All');
    expect(stripSpokenAppName('Chaos in Psysonic')).toBe('Chaos');
    expect(stripSpokenAppName('Chaos with Psy Sonic')).toBe('Chaos');
  });

  it('leaves titles that only contain such words alone', () => {
    expect(stripSpokenAppName('Psychic TV')).toBe('Psychic TV');
    expect(stripSpokenAppName('Back in Black')).toBe('Back in Black');
    expect(stripSpokenAppName('Sonic Youth')).toBe('Sonic Youth');
  });

  it('returns nothing for empty input or a request that was only the app name', () => {
    expect(stripSpokenAppName(null)).toBeUndefined();
    expect(stripSpokenAppName('   ')).toBeUndefined();
  });
});

const song = (id: string, title: string, artistId = 'ar1') => ({
  id, title, artist: 'Band', artistId, album: 'Record', albumId: 'al1', duration: 200,
});

describe('playSiriRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.playlists = [];
    mocks.runLocalLiveSearch.mockResolvedValue(null);
    mocks.runNetworkLiveSearch.mockResolvedValue({ artists: [], albums: [], songs: [] });
    mocks.resolveAlbum.mockResolvedValue(undefined);
  });

  it('a request without any name starts the random mix', async () => {
    expect(await playSiriRequest({ mediaType: 0 })).toBe(true);
    expect(mocks.carPlayPlay).toHaveBeenCalledWith('random');
  });

  it('a song request plays the matching title, alone when its album cannot be resolved', async () => {
    mocks.runLocalLiveSearch.mockResolvedValue({
      artists: [], albums: [], songs: [song('t1', 'Other'), song('t2', 'Chaos')],
    });
    expect(await playSiriRequest({ mediaName: 'chaos', mediaType: 1 })).toBe(true);
    const [first, queue] = mocks.playTrack.mock.calls[0];
    expect(first.id).toBe('t2');
    expect(queue.map((t: { id: string }) => t.id)).toEqual(['t2']);
  });

  it('a song plays on with its album, starting at that song, not with unrelated hits', async () => {
    mocks.runLocalLiveSearch.mockResolvedValue({
      artists: [], albums: [], songs: [{ ...song('x1', 'Chaos', 'ar9'), artist: 'Other' }, song('t2', 'Chaos')],
    });
    mocks.resolveAlbum.mockResolvedValue({ album: {}, songs: [song('t1', 'Intro'), song('t2', 'Chaos'), song('t3', 'Outro')] });
    expect(await playSiriRequest({ mediaName: 'Band Chaos', mediaType: 1 })).toBe(true);
    expect(mocks.resolveAlbum).toHaveBeenCalledWith('srv', 'al1');
    const [first, queue] = mocks.playTrack.mock.calls[0];
    expect(first.id).toBe('t2');
    expect(queue.map((t: { id: string }) => t.id)).toEqual(['t1', 't2', 't3']);
  });

  it('artist and title in one name, artist misheard: picks the title by the closest artist', async () => {
    mocks.runLocalLiveSearch.mockResolvedValue({
      artists: [],
      albums: [],
      songs: [
        { ...song('a', 'Streets of Fire'), artist: 'Fire Strike' },
        { ...song('b', 'Motörhead'), artist: 'Motörhead' },
        { ...song('c', 'Streets of Fire'), artist: 'Motorjesus' },
      ],
    });
    expect(await playSiriRequest({ mediaName: 'Motörhead Streets of Fire', mediaType: 0 })).toBe(true);
    expect(mocks.playTrack.mock.calls[0][0].id).toBe('c');
  });

  it('a title lost among local hits for one of its words is looked up on the server', async () => {
    mocks.runLocalLiveSearch.mockResolvedValue({
      artists: [], albums: [], songs: [{ ...song('l1', 'Love Machine'), artist: 'Reckless Love' }],
    });
    mocks.runNetworkLiveSearch.mockResolvedValue({
      artists: [], albums: [], songs: [{ ...song('n1', 'Waiting On Love'), artist: 'FM' }],
    });
    expect(await playSiriRequest({ mediaName: 'Waiting On Love', mediaType: 0 })).toBe(true);
    expect(mocks.playTrack.mock.calls[0][0].id).toBe('n1');
  });

  it('a local hit that fits the title needs no server search', async () => {
    mocks.runLocalLiveSearch.mockResolvedValue({ artists: [], albums: [], songs: [song('t1', 'Chaos')] });
    expect(await playSiriRequest({ mediaName: 'Chaos', mediaType: 0 })).toBe(true);
    expect(mocks.runNetworkLiveSearch).not.toHaveBeenCalled();
    expect(mocks.playTrack.mock.calls[0][0].id).toBe('t1');
  });

  it('nothing fits anywhere: the local hits still play rather than nothing', async () => {
    mocks.runLocalLiveSearch.mockResolvedValue({ artists: [], albums: [], songs: [song('l1', 'Something')] });
    expect(await playSiriRequest({ mediaName: 'Unknown Words', mediaType: 0 })).toBe(true);
    expect(mocks.runNetworkLiveSearch).toHaveBeenCalled();
    expect(mocks.playTrack.mock.calls[0][0].id).toBe('l1');
  });

  it('an album named like a song by the same artist starts the album at its first track', async () => {
    mocks.runLocalLiveSearch.mockResolvedValue({
      artists: [],
      albums: [{ id: 'al1', name: 'Streets of Fire', artist: 'Motorjesus', serverId: 'srv' }],
      songs: [{ ...song('t2', 'Streets of Fire'), artist: 'Motorjesus' }],
    });
    mocks.resolveAlbum.mockResolvedValue({ album: {}, songs: [song('t1', 'Intro'), song('t2', 'Streets of Fire')] });
    expect(await playSiriRequest({ mediaName: 'Motorjesus Streets of Fire', mediaType: 0 })).toBe(true);
    expect(mocks.playTrack.mock.calls[0][0].id).toBe('t1');
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

  it('searches without the app name Siri left in the request', async () => {
    mocks.runLocalLiveSearch.mockResolvedValue(null);
    await playSiriRequest({ mediaName: 'Chaos mit Psychic', mediaType: 0 });
    expect(mocks.runNetworkLiveSearch).toHaveBeenCalledWith('Chaos');
  });

  it('reports false when nothing matches', async () => {
    expect(await playSiriRequest({ mediaName: 'Nothing here', mediaType: 0 })).toBe(false);
    expect(mocks.playTrack).not.toHaveBeenCalled();
  });
});

describe('spokenMatchScore', () => {
  it('ignores accents and case', () => {
    expect(normalizeSpoken('Motörhead – Ace of Spades!')).toBe('motorhead ace of spades');
  });

  it('needs the title in what was said and ranks a close artist above an unrelated one', () => {
    const q = 'Motörhead Streets of Fire';
    expect(spokenMatchScore(q, 'Something Else', 'Motorjesus')).toBe(0);
    expect(spokenMatchScore(q, 'Streets of Fire', 'Motorjesus'))
      .toBeGreaterThan(spokenMatchScore(q, 'Streets of Fire', 'Place Vendome'));
    expect(spokenMatchScore(q, 'Streets of Fire', 'Motörhead'))
      .toBeGreaterThan(spokenMatchScore(q, 'Streets of Fire', 'Motorjesus'));
  });

  it('a whole-name match beats a partial one', () => {
    expect(spokenMatchScore('Chaos', 'Chaos', 'Band')).toBeGreaterThan(spokenMatchScore('Band Chaos', 'Chaos', 'Other'));
  });
});
