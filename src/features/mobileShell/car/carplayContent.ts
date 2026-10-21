import i18n from '@/lib/i18n';
import {
  usePlayerStore,
  shuffleTracks,
  withQueueSource,
  fetchGenreCatalog,
  fetchScopedGenreCatalog,
  queueSongStar,
  resolveQueueTrack,
  type QueueSource,
} from '@/features/playback';
import { loadHomeChronologicalFeed } from '@/features/home';
import { usePlaylistStore, resolvePlaylistTracks } from '@/features/playlist';
import {
  buildTracksForOfflineCard,
  ensureServerForOfflineCard,
  hydrateOfflineLibraryCards,
  isOfflineBrowseActive,
  loadArtistFromLibraryIndex,
  loadStarredFromAllLibraryIndexes,
  offlineQueueServerKeyForCard,
  offlineTrackCount,
  type OfflineLibraryCard,
} from '@/features/offline';
import { fetchAlbumBrowsePage } from '@/lib/library/albumBrowseLoad';
import { fetchGenreAlbumPage } from '@/lib/library/genreAlbumBrowse';
import { fetchLocalArtistCatalogChunk, runLocalRandomSongs } from '@/lib/library/browseTextSearch';
import {
  deriveLibraryBrowseIndexScopes,
  getLibraryBrowseScope,
  browseScopeLibraryIdsForServer,
} from '@/lib/library/libraryBrowseScope';
import { getAlbumListForServer, getRandomSongsForServer } from '@/lib/api/subsonicLibrary';
import { getInternetRadioStationsForServer } from '@/lib/api/subsonicRadio';
import type { InternetRadioStation, SubsonicAlbum, SubsonicSong } from '@/lib/api/subsonicTypes';
import { fetchGenreTracksForPlayback } from '@/features/playback/utils/playback/genreBrowsePlayback';
import { isLuckyMixAvailable } from '@/features/randomMix';
import { buildAndPlayLuckyMix } from '@/features/randomMix/utils/luckyMix';
import { deriveEffectiveLibraryBrowseServerIds } from '@/lib/library/libraryBrowseScope';
import { songToTrack } from '@/lib/media/songToTrack';
import type { Track } from '@/lib/media/trackTypes';
import { resolveAlbum } from '@/store/mediaResolver';
import { useAuthStore } from '@/store/authStore';
import { useLibraryIndexStore } from '@/store/libraryIndexStore';
import { useLocalPlaybackStore } from '@/store/localPlaybackStore';
import { ownedOverrideValue } from '@/lib/util/ownedEntityKey';
import { resolveServerIdForIndexKey } from '@/lib/server/serverLookup';
import { attachCarPlayCovers, type CarPlayCoverRefresh, type CarPlayCoverSource } from './carplayCovers';

/** Symbol a row shows when it has no cover; each car maps it to its own image. */
export type CarPlayIcon =
  | 'home' | 'library' | 'playlists' | 'lucky' | 'shuffle' | 'resume' | 'heart' | 'download' | 'radio';

/** One row in a CarPlay list: `browse` rows open `node`, the others play it. */
export interface CarPlayItem {
  node: string;
  title: string;
  subtitle?: string;
  browse: boolean;
  /** Absolute path of the row's cover on disk. */
  image?: string;
  cover?: CarPlayCoverSource;
  icon?: CarPlayIcon;
}

export interface CarPlaySection {
  header?: string;
  items: CarPlayItem[];
  /** A row of covers under `header`; tapping the header opens this node, the full list. */
  more?: string;
}

export interface CarPlayList {
  sections: CarPlaySection[];
  emptyText?: string;
  /** Downloads covers that were not on disk yet; not sent to native. */
  refreshCovers?: CarPlayCoverRefresh;
}

/** What the now-playing buttons show. */
export interface CarPlayState {
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  starred: boolean;
  /** The infinite queue is on (the ∞ button). */
  infinite: boolean;
  hasTrack: boolean;
  /** Titles of the lists behind the up-next and album/artist buttons. */
  upNextTitle: string;
  albumTitle: string;
}

/** CarPlay cuts long lists anyway; this keeps the requests small. */
const LIST_LIMIT = 200;
const RANDOM_MIX_SIZE = 50;
/** Covers per row on the Start tab; the car shows as many as fit. */
const COVER_ROW_SIZE = 12;
/** Albums behind a cover row's header. */
const FEED_LIST_SIZE = 100;
/** A genre mix with fewer songs than this falls back to a plain random mix. */
const GENRE_MIX_MIN = 10;

// Node ids: `kind|part|part`, each part URI-encoded so ids with `|` stay intact.
const node = (kind: string, ...parts: string[]) => [kind, ...parts.map(encodeURIComponent)].join('|');
function parseNode(id: string): [string, string[]] {
  const [kind, ...parts] = id.split('|');
  return [kind, parts.map(decodeURIComponent)];
}

/** Track lists shown in CarPlay, kept so a tapped row plays exactly what was listed. */
interface ShownTracks { tracks: Track[]; source?: QueueSource }
const shownTracks = new Map<string, ShownTracks>();
/** Offline cards shown in the downloads list, by position. */
let shownOfflineCards: OfflineLibraryCard[] = [];
/** Radio stations shown in the radio list, by position. */
let shownStations: InternetRadioStation[] = [];

const t = (key: string) => i18n.t(key);

function browseServerId(): string | null {
  const scope = getLibraryBrowseScope();
  return scope.anchorServerId ?? useAuthStore.getState().activeServerId ?? null;
}

function indexEnabled(serverId: string): boolean {
  return useLibraryIndexStore.getState().isIndexEnabled(serverId);
}

function albumRows(albums: SubsonicAlbum[], fallbackServerId: string): CarPlayItem[] {
  return albums.slice(0, LIST_LIMIT).map(album => ({
    node: node('album', album.serverId ?? fallbackServerId, album.id),
    title: album.name,
    subtitle: album.artist,
    browse: true,
    cover: { kind: 'album', id: album.id, coverArt: album.coverArt, serverId: album.serverId ?? fallbackServerId },
  }));
}

/** "Play all" + "Shuffle" + one row per track, remembering the list under `listNode`. */
function trackListRows(listNode: string, tracks: Track[], source?: QueueSource): CarPlaySection[] {
  shownTracks.set(listNode, { tracks, source });
  if (tracks.length === 0) return [];
  return [
    {
      items: [
        { node: node('playall', listNode), title: t('albumDetail.playAll'), browse: false },
        { node: node('shuffle', listNode), title: t('albumDetail.shuffle'), browse: false },
      ],
    },
    {
      items: tracks.slice(0, LIST_LIMIT).map((track, index) => ({
        node: node('track', listNode, String(index)),
        title: track.title,
        subtitle: track.artist,
        browse: false,
      })),
    },
  ];
}

const empty = (): CarPlayList => ({ sections: [], emptyText: t('deviceSync.browserEmpty') });

/** The album lists behind the Start tab's cover rows. */
type AlbumFeed = 'recentlyPlayed' | 'frequent' | 'newest' | 'random' | 'starred';

const ALBUM_FEEDS: ReadonlyArray<{ feed: AlbumFeed; title: () => string }> = [
  { feed: 'recentlyPlayed', title: () => t('home.recentlyPlayed') },
  { feed: 'frequent', title: () => t('home.mostPlayed') },
  { feed: 'newest', title: () => t('carPlay.recentlyAdded') },
  { feed: 'random', title: () => t('carPlay.randomAlbums') },
  { feed: 'starred', title: () => t('carPlay.starredAlbums') },
];

/**
 * Recently played and added come from the local index, like the Start page, but in one
 * request: page by page (12 albums each, every page scanning from the top again) took 2.4 s a
 * page on an Android phone, so 100 albums missed the car's 10 s (car test 21.10.).
 */
async function chronologicalAlbums(serverId: string, feed: 'recentlyPlayed' | 'newReleases', size: number): Promise<SubsonicAlbum[] | null> {
  const scope = getLibraryBrowseScope();
  const page = await loadHomeChronologicalFeed({
    anchorServerId: serverId,
    serverIds: scope.serverIds,
    scopes: scope.pairs,
    feed,
    limit: size,
  });
  return page.status === 'success' ? page.albums.slice(0, size) : null;
}

async function feedAlbums(serverId: string, feed: AlbumFeed, size: number): Promise<SubsonicAlbum[]> {
  if (feed === 'starred') {
    const starred = await loadStarredFromAllLibraryIndexes();
    return starred.albums.slice(0, size);
  }
  if (feed === 'recentlyPlayed' || feed === 'newest') {
    const local = await chronologicalAlbums(serverId, feed === 'newest' ? 'newReleases' : 'recentlyPlayed', size);
    if (local) return local;
  }
  const type = feed === 'recentlyPlayed' ? 'recent' : feed;
  const libraryIds = browseScopeLibraryIdsForServer(getLibraryBrowseScope().pairs, serverId);
  return getAlbumListForServer(serverId, type, size, 0, {}, 15000, libraryIds).catch(() => []);
}

/** The playing (or paused) queue's song: a tap carries on with it. */
function resumeRow(): CarPlayItem | null {
  const { currentTrack, currentRadio } = usePlayerStore.getState();
  if (!currentTrack || currentRadio) return null;
  const serverId = currentTrack.serverId ?? browseServerId() ?? '';
  return {
    node: node('resume'),
    title: currentTrack.title,
    subtitle: [currentTrack.artist, t('carPlay.resumeHint')].filter(Boolean).join(' · '),
    browse: false,
    icon: 'resume',
    cover: currentTrack.albumId
      ? { kind: 'album', id: currentTrack.albumId, coverArt: currentTrack.coverArt, serverId }
      : undefined,
  };
}

function randomMixHint(): string {
  const genre = usePlayerStore.getState().currentTrack?.genre?.trim();
  return genre ? `${t('carPlay.randomMixHint')} (${genre})` : t('carPlay.randomMixHintNoGenre');
}

async function homeList(): Promise<CarPlayList> {
  const serverId = browseServerId();
  const sections: CarPlaySection[] = [];
  const resume = resumeRow();
  if (resume) sections.push({ header: t('carPlay.resume'), items: [resume] });
  sections.push({
    header: t('carPlay.quickPlay'),
    items: [
      { node: node('random'), title: t('sidebar.randomMix'), subtitle: randomMixHint(), browse: false, icon: 'shuffle' },
      { node: node('favplay'), title: t('carPlay.favoritesPlay'), subtitle: t('carPlay.favoritesPlayHint'), browse: false, icon: 'heart' },
      { node: node('downloads'), title: t('carPlay.downloads'), subtitle: t('carPlay.downloadsHint'), browse: true, icon: 'download' },
    ],
  });
  if (!serverId) return { sections };
  const rows = await Promise.all(ALBUM_FEEDS.map(({ feed }) => feedAlbums(serverId, feed, COVER_ROW_SIZE).catch(() => [])));
  ALBUM_FEEDS.forEach(({ feed, title }, index) => {
    if (rows[index].length === 0) return;
    sections.push({ header: title(), items: albumRows(rows[index], serverId), more: node('feed', feed) });
  });
  return { sections };
}

/** The full list behind a cover row's header. */
async function feedList(feed: string): Promise<CarPlayList> {
  const serverId = browseServerId();
  if (!serverId || !ALBUM_FEEDS.some(entry => entry.feed === feed)) return empty();
  const albums = await feedAlbums(serverId, feed as AlbumFeed, FEED_LIST_SIZE);
  return albums.length > 0 ? { sections: [{ items: albumRows(albums, serverId) }] } : empty();
}

function luckyMixAvailableNow(): boolean {
  const auth = useAuthStore.getState();
  return isLuckyMixAvailable({
    activeServerId: auth.activeServerId,
    libraryBrowseServerIds: deriveEffectiveLibraryBrowseServerIds(auth),
    audiomuseByServer: auth.audiomuseNavidromeByServer,
    showLuckyMixMenu: auth.showLuckyMixMenu,
  });
}

/** The fourth tab: Lucky Mix where AudioMuse runs, the random mix everywhere else. */
function mixList(): CarPlayList {
  const item: CarPlayItem = luckyMixAvailableNow()
    ? { node: node('luckymix'), title: t('carPlay.luckyMixStart'), subtitle: t('carPlay.luckyMixStartHint'), browse: false, icon: 'lucky' }
    : { node: node('random'), title: t('carPlay.randomMixStart'), subtitle: randomMixHint(), browse: false, icon: 'shuffle' };
  return { sections: [{ items: [item] }] };
}

async function radioList(): Promise<CarPlayList> {
  const serverId = browseServerId();
  const stations = serverId ? await getInternetRadioStationsForServer(serverId).catch(() => []) : [];
  shownStations = stations.slice(0, LIST_LIMIT);
  if (shownStations.length === 0) return empty();
  return {
    sections: [{
      items: shownStations.map((station, index) => ({
        node: node('radio', String(index)),
        title: station.name,
        browse: false,
        icon: 'radio' as const,
        cover: station.coverArt && serverId
          ? { kind: 'playlist' as const, id: station.id, coverArt: station.coverArt, serverId }
          : undefined,
      })),
    }],
  };
}

async function playlistsList(): Promise<CarPlayList> {
  const store = usePlaylistStore.getState();
  if (store.playlists.length === 0) await store.fetchPlaylists();
  const playlists = usePlaylistStore.getState().playlists;
  if (playlists.length === 0) return empty();
  return {
    sections: [{
      items: playlists.slice(0, LIST_LIMIT).map(playlist => ({
        node: node('playlist', playlist.serverId ?? '', playlist.id),
        title: playlist.name,
        subtitle: String(playlist.songCount),
        browse: true,
        cover: playlist.coverArt
          ? { kind: 'playlist' as const, id: playlist.id, coverArt: playlist.coverArt, serverId: playlist.serverId ?? '' }
          : undefined,
      })),
    }],
  };
}

function libraryList(): CarPlayList {
  return {
    sections: [{
      items: [
        { node: node('artists'), title: t('sidebar.artists'), browse: true },
        { node: node('albums'), title: t('sidebar.allAlbums'), browse: true },
        { node: node('feed', 'newest'), title: t('carPlay.recentlyAdded'), browse: true },
        { node: node('genres'), title: t('sidebar.genres'), browse: true },
        { node: node('radio'), title: t('sidebar.radio'), browse: true },
      ],
    }],
  };
}

async function artistsList(): Promise<CarPlayList> {
  const serverId = browseServerId();
  if (!serverId) return empty();
  const chunk = await fetchLocalArtistCatalogChunk(serverId, 0, LIST_LIMIT, 'album', null, {
    libraryScopes: getLibraryBrowseScope().pairs,
  });
  if (!chunk || chunk.artists.length === 0) return empty();
  return {
    sections: [{
      items: chunk.artists.map(artist => ({
        node: node('artist', artist.serverId ?? serverId, artist.id),
        title: artist.name,
        browse: true,
        cover: { kind: 'artist' as const, id: artist.id, coverArt: artist.coverArt, serverId: artist.serverId ?? serverId },
      })),
    }],
  };
}

async function artistList(serverId: string, artistId: string): Promise<CarPlayList> {
  const loaded = await loadArtistFromLibraryIndex(serverId, artistId);
  const albums = loaded ? [...loaded.albums, ...loaded.appearsOnAlbums] : [];
  if (albums.length === 0) return empty();
  return { sections: [{ items: albumRows(albums, serverId) }] };
}

async function albumsList(): Promise<CarPlayList> {
  const serverId = browseServerId();
  if (!serverId) return empty();
  const page = await fetchAlbumBrowsePage(serverId, indexEnabled(serverId), {
    sort: 'alphabeticalByName',
    genres: [],
    losslessOnly: false,
    starredOnly: false,
    compFilter: 'all',
  }, 0, LIST_LIMIT);
  if (page.albums.length === 0) return empty();
  return { sections: [{ items: albumRows(page.albums, serverId) }] };
}

async function albumList(listNode: string, serverId: string, albumId: string): Promise<CarPlayList> {
  const resolved = await resolveAlbum(serverId, albumId);
  if (!resolved) return empty();
  const tracks = resolved.songs.map((song: SubsonicSong) => ({ ...songToTrack(song), serverId: song.serverId ?? serverId }));
  return { sections: trackListRows(listNode, tracks, { kind: 'album', id: albumId, serverId }) };
}

async function playlistList(listNode: string, serverId: string, playlistId: string): Promise<CarPlayList> {
  const tracks = await resolvePlaylistTracks(playlistId, serverId || undefined);
  return {
    sections: trackListRows(listNode, tracks, { kind: 'playlist', id: playlistId, serverId: serverId || undefined }),
    emptyText: t('deviceSync.browserEmpty'),
  };
}

async function genresList(): Promise<CarPlayList> {
  const serverId = browseServerId();
  const scopes = deriveLibraryBrowseIndexScopes(useAuthStore.getState());
  const genres = scopes.length > 0 && !isOfflineBrowseActive()
    ? await fetchScopedGenreCatalog(scopes)
    : await fetchGenreCatalog(serverId, serverId ? indexEnabled(serverId) : false);
  if (genres.length === 0) return empty();
  return {
    sections: [{
      items: genres.slice(0, LIST_LIMIT).map(genre => ({
        node: node('genre', genre.value),
        title: genre.value,
        subtitle: genre.albumCount ? String(genre.albumCount) : undefined,
        browse: true,
      })),
    }],
  };
}

async function genreList(genre: string): Promise<CarPlayList> {
  const serverId = browseServerId();
  if (!serverId) return empty();
  const page = await fetchGenreAlbumPage(
    serverId, genre, indexEnabled(serverId), 0, LIST_LIMIT, 'alphabeticalByName', getLibraryBrowseScope(),
  );
  if (page.albums.length === 0) return empty();
  return { sections: [{ items: albumRows(page.albums, serverId) }] };
}

async function favoritesList(listNode: string): Promise<CarPlayList> {
  const starred = await loadStarredFromAllLibraryIndexes();
  return { sections: trackListRows(listNode, starred.songs.map(songToTrack)), emptyText: t('deviceSync.browserEmpty') };
}

async function downloadsList(): Promise<CarPlayList> {
  const groups = useLocalPlaybackStore.getState().listPinnedGroups();
  const cards = (await hydrateOfflineLibraryCards(groups)).filter(card => offlineTrackCount(card) > 0);
  shownOfflineCards = cards;
  if (cards.length === 0) return empty();
  return {
    sections: [{
      items: cards.slice(0, LIST_LIMIT).map((card, index) => ({
        node: node('offline', String(index)),
        title: card.name,
        subtitle: card.artist,
        browse: false,
        cover: card.coverArt
          ? { kind: 'album' as const, id: card.pinSource.sourceId, coverArt: card.coverArt, serverId: resolveServerIdForIndexKey(card.serverIndexKey) }
          : undefined,
      })),
    }],
  };
}

/** "Up next" in the now-playing screen: the queue from the playing track on. */
function queueList(): CarPlayList {
  const { queueItems, queueIndex } = usePlayerStore.getState();
  const start = Math.max(queueIndex, 0);
  const items = queueItems.slice(start, start + LIST_LIMIT).map((ref, offset) => {
    const track = resolveQueueTrack(ref);
    return {
      node: node('queueat', String(start + offset)),
      title: track.title,
      subtitle: track.artist,
      browse: false,
    };
  });
  return items.length > 0 ? { sections: [{ items }] } : empty();
}

/**
 * The album of the playing track (now-playing screen's album/artist button): the artist
 * first, as a row that opens their albums, then the album's own list.
 */
async function currentList(): Promise<CarPlayList> {
  const track = usePlayerStore.getState().currentTrack;
  if (!track?.albumId) return empty();
  const serverId = track.serverId ?? browseServerId() ?? '';
  const albumNode = node('album', serverId, track.albumId);
  const album = await albumList(albumNode, serverId, track.albumId);
  // The playing track may lack the artist id (queued from a search or the local index);
  // the album's own tracks usually carry it.
  const albumTrack = shownTracks.get(albumNode)?.tracks.find(candidate => candidate.artistId);
  const artistId = track.artistId ?? albumTrack?.artistId;
  const artistName = track.artist || albumTrack?.artist;
  if (!artistId || !artistName) return album;
  const artistRow: CarPlayItem = {
    node: node('artist', serverId, artistId),
    title: artistName,
    browse: true,
    cover: { kind: 'artist', id: artistId, serverId },
  };
  return { ...album, sections: [{ items: [artistRow] }, ...album.sections] };
}

function tabsList(): CarPlayList {
  return {
    sections: [{
      items: [
        { node: node('home'), title: t('sidebar.mainstage'), browse: true, icon: 'home' },
        { node: node('library'), title: t('sidebar.library'), browse: true, icon: 'library' },
        { node: node('playlists'), title: t('sidebar.playlists'), browse: true, icon: 'playlists' },
        luckyMixAvailableNow()
          ? { node: node('mix'), title: t('sidebar.feelingLucky'), browse: true, icon: 'lucky' }
          : { node: node('mix'), title: t('sidebar.randomMix'), browse: true, icon: 'shuffle' },
      ],
    }],
    emptyText: t('common.loading'),
  };
}

/** Answers CarPlay's request for the list behind `id`; covers on disk are attached. */
export async function carPlayList(id: string): Promise<CarPlayList> {
  const list = await listFor(id);
  const refreshCovers = await attachCarPlayCovers(list.sections).catch(() => null);
  return refreshCovers ? { ...list, refreshCovers } : list;
}

async function listFor(id: string): Promise<CarPlayList> {
  const [kind, parts] = parseNode(id);
  switch (kind) {
    case 'tabs': return tabsList();
    case 'home': return homeList();
    case 'playlists': return playlistsList();
    case 'library': return libraryList();
    case 'downloads': return downloadsList();
    case 'mix': return mixList();
    case 'feed': return feedList(parts[0]);
    case 'radio': return radioList();
    case 'artists': return artistsList();
    case 'albums': return albumsList();
    case 'genres': return genresList();
    case 'favorites': return favoritesList(id);
    case 'artist': return artistList(parts[0], parts[1]);
    case 'album': return albumList(id, parts[0], parts[1]);
    case 'playlist': return playlistList(id, parts[0], parts[1]);
    case 'genre': return genreList(parts[0]);
    case 'queue': return queueList();
    case 'current': return currentList();
    default: return empty();
  }
}

function playShown(listNode: string, index: number, shuffle: boolean): void {
  const shown = shownTracks.get(listNode);
  if (!shown || shown.tracks.length === 0) return;
  const { playTrack } = usePlayerStore.getState();
  if (shuffle) {
    const queue = shuffleTracks(shown.tracks);
    playTrack(queue[0], queue);
    return;
  }
  const start = Math.min(Math.max(index, 0), shown.tracks.length - 1);
  const run = () => playTrack(shown.tracks[start], shown.tracks, true, false, start);
  if (shown.source) withQueueSource(shown.source, run);
  else run();
}

/** Songs in the playing song's genre; without a genre, or with too few songs, any songs. */
async function playRandomMix(): Promise<void> {
  const serverId = browseServerId();
  if (!serverId) return;
  const genre = usePlayerStore.getState().currentTrack?.genre?.trim();
  if (genre) {
    const inGenre = await fetchGenreTracksForPlayback(serverId, genre, {
      shuffle: true, cap: RANDOM_MIX_SIZE, indexEnabled: indexEnabled(serverId),
    }).catch(() => []);
    if (inGenre.length >= GENRE_MIX_MIN) {
      usePlayerStore.getState().playTrack(inGenre[0], inGenre);
      return;
    }
  }
  const scopes = getLibraryBrowseScope().pairs;
  const local = await runLocalRandomSongs(serverId, RANDOM_MIX_SIZE, scopes);
  const songs = local && local.length > 0
    ? local
    : await getRandomSongsForServer(
      serverId, RANDOM_MIX_SIZE, undefined, undefined, browseScopeLibraryIdsForServer(scopes, serverId),
    );
  const tracks = songs.map(songToTrack);
  if (tracks.length > 0) usePlayerStore.getState().playTrack(tracks[0], tracks);
}

async function playOfflineCard(index: number): Promise<void> {
  const card = shownOfflineCards[index];
  if (!card || !(await ensureServerForOfflineCard(card))) return;
  usePlayerStore.setState({ queueServerId: offlineQueueServerKeyForCard(card) });
  const tracks = await buildTracksForOfflineCard(card);
  if (tracks.length > 0) usePlayerStore.getState().playTrack(tracks[0], tracks);
}

async function playFavorites(): Promise<void> {
  const starred = await loadStarredFromAllLibraryIndexes();
  const tracks = shuffleTracks(starred.songs.map(songToTrack));
  if (tracks.length > 0) usePlayerStore.getState().playTrack(tracks[0], tracks);
}

function resumePlayback(): void {
  const player = usePlayerStore.getState();
  if (player.currentTrack && !player.isPlaying) player.resume();
}

function playStation(index: number): void {
  const station = shownStations[index];
  if (station) usePlayerStore.getState().playRadio(station);
}

/** Plays what a CarPlay row stands for. */
export async function carPlayPlay(id: string): Promise<void> {
  const [kind, parts] = parseNode(id);
  switch (kind) {
    case 'playall': playShown(parts[0], 0, false); return;
    case 'shuffle': playShown(parts[0], 0, true); return;
    case 'track': playShown(parts[0], Number(parts[1]), false); return;
    case 'random': await playRandomMix(); return;
    case 'favplay': await playFavorites(); return;
    case 'luckymix': await buildAndPlayLuckyMix(); return;
    case 'resume': resumePlayback(); return;
    case 'radio': playStation(Number(parts[0])); return;
    case 'offline': await playOfflineCard(Number(parts[0])); return;
    case 'queueat': playQueueIndex(Number(parts[0])); return;
    default: return;
  }
}

function playQueueIndex(index: number): void {
  const { queueItems, playTrack } = usePlayerStore.getState();
  const ref = queueItems[index];
  if (!ref) return;
  playTrack(resolveQueueTrack(ref), undefined, true, false, index);
}

/** Tabs that show the playing song: the resume row and the random mix's genre. */
export const CAR_SONG_TABS = [node('home'), node('mix')];
/** Song changes within this window refresh the tabs once (skipping through a queue). */
const SONG_TABS_DELAY = 1500;

const songTabsKey = () => {
  const { currentTrack, currentRadio } = usePlayerStore.getState();
  return [currentTrack?.id, currentTrack?.genre, currentRadio?.id].join('|');
};

/**
 * Calls `refresh` with `CAR_SONG_TABS` when the playing song changes. A car keeps a tab's
 * rows until told, so the Start tab built at a cold start, before the queue was back, had
 * no resume row and no genre (car test 21.10.).
 */
export function watchCarSongTabs(refresh: (nodes: string[]) => void): () => void {
  let last = songTabsKey();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const off = usePlayerStore.subscribe(() => {
    const next = songTabsKey();
    if (next === last) return;
    last = next;
    clearTimeout(timer);
    timer = setTimeout(() => refresh(CAR_SONG_TABS), SONG_TABS_DELAY);
  });
  return () => {
    off();
    clearTimeout(timer);
  };
}

/** The state the now-playing buttons reflect. */
export function carPlayState(): CarPlayState {
  const { currentTrack, shuffleMode, repeatMode, starredOverrides } = usePlayerStore.getState();
  const starred = currentTrack
    ? (ownedOverrideValue(starredOverrides, currentTrack) ?? !!currentTrack.starred)
    : false;
  return {
    shuffle: shuffleMode,
    repeat: repeatMode,
    starred,
    infinite: useAuthStore.getState().infiniteQueueEnabled,
    hasTrack: !!currentTrack,
    upNextTitle: t('queue.upNext'),
    albumTitle: currentTrack?.album ?? '',
  };
}

/** A now-playing button was pressed in the car. */
export function carPlayCommand(action: string): void {
  const player = usePlayerStore.getState();
  switch (action) {
    case 'shuffle': player.toggleShuffleMode(); return;
    case 'repeat': player.toggleRepeat(); return;
    case 'infinite': {
      const auth = useAuthStore.getState();
      auth.setInfiniteQueueEnabled(!auth.infiniteQueueEnabled);
      return;
    }
    case 'star': {
      const track = player.currentTrack;
      if (track) queueSongStar(track.id, !carPlayState().starred, track.serverId);
      return;
    }
    default: return;
  }
}

export function _resetCarPlayContentForTest(): void {
  shownTracks.clear();
  shownOfflineCards = [];
  shownStations = [];
}
