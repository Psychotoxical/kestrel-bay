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
import { getRandomSongsForServer } from '@/lib/api/subsonicLibrary';
import type { SubsonicAlbum, SubsonicSong } from '@/lib/api/subsonicTypes';
import { songToTrack } from '@/lib/media/songToTrack';
import type { Track } from '@/lib/media/trackTypes';
import { resolveAlbum } from '@/store/mediaResolver';
import { useAuthStore } from '@/store/authStore';
import { useLibraryIndexStore } from '@/store/libraryIndexStore';
import { useLocalPlaybackStore } from '@/store/localPlaybackStore';
import { ownedOverrideValue } from '@/lib/util/ownedEntityKey';
import { resolveServerIdForIndexKey } from '@/lib/server/serverLookup';
import { attachCarPlayCovers, type CarPlayCoverSource, type CarPlayCoverUpdate } from './carplayCovers';

/** One row in a CarPlay list: `browse` rows open `node`, the others play it. */
export interface CarPlayItem {
  node: string;
  title: string;
  subtitle?: string;
  browse: boolean;
  /** Absolute path of the row's cover on disk. */
  image?: string;
  cover?: CarPlayCoverSource;
}

export interface CarPlaySection {
  header?: string;
  items: CarPlayItem[];
}

export interface CarPlayList {
  sections: CarPlaySection[];
  emptyText?: string;
  /** Downloads covers that were not on disk yet; not sent to native. */
  refreshCovers?: () => Promise<CarPlayCoverUpdate[]>;
}

/** What the now-playing buttons show. */
export interface CarPlayState {
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  starred: boolean;
  hasTrack: boolean;
  /** Titles of the lists behind the up-next and album/artist buttons. */
  upNextTitle: string;
  albumTitle: string;
}

/** CarPlay cuts long lists anyway; this keeps the requests small. */
const LIST_LIMIT = 200;
const RANDOM_MIX_SIZE = 50;

// Node ids: `kind|part|part`, each part URI-encoded so ids with `|` stay intact.
const node = (kind: string, ...parts: string[]) => [kind, ...parts.map(encodeURIComponent)].join('|');
function parseNode(id: string): [string, string[]] {
  const [kind, ...parts] = id.split('|');
  return [kind, parts.map(decodeURIComponent)];
}

/** Track lists shown in CarPlay, kept so a tapped row plays exactly what was listed. */
interface ShownTracks { tracks: Track[]; source?: QueueSource }
const shownTracks = new Map<string, ShownTracks>();
/** Offline cards shown in the downloads tab, by position. */
let shownOfflineCards: OfflineLibraryCard[] = [];

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

async function homeList(): Promise<CarPlayList> {
  const serverId = browseServerId();
  const sections: CarPlaySection[] = [];
  if (serverId) {
    const scope = getLibraryBrowseScope();
    const feed = await loadHomeChronologicalFeed({
      anchorServerId: serverId,
      serverIds: scope.serverIds,
      scopes: scope.pairs,
      feed: 'recentlyPlayed',
    });
    if (feed.status === 'success' && feed.albums.length > 0) {
      sections.push({ header: t('home.recentlyPlayed'), items: albumRows(feed.albums, serverId) });
    }
  }
  sections.push({
    items: [
      { node: node('random'), title: t('sidebar.randomMix'), browse: false },
      { node: node('favorites'), title: t('sidebar.favorites'), browse: true },
    ],
  });
  return { sections };
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
        { node: node('genres'), title: t('sidebar.genres'), browse: true },
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

/** The album of the playing track (now-playing screen's album/artist button). */
async function currentList(): Promise<CarPlayList> {
  const track = usePlayerStore.getState().currentTrack;
  if (!track?.albumId) return empty();
  const serverId = track.serverId ?? browseServerId() ?? '';
  const albumNode = node('album', serverId, track.albumId);
  return albumList(albumNode, serverId, track.albumId);
}

function tabsList(): CarPlayList {
  return {
    sections: [{
      items: [
        { node: node('home'), title: t('sidebar.mainstage'), browse: true },
        { node: node('playlists'), title: t('sidebar.playlists'), browse: true },
        { node: node('library'), title: t('sidebar.library'), browse: true },
        { node: node('downloads'), title: t('sidebar.offlineLibrary'), browse: true },
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

async function playRandomMix(): Promise<void> {
  const serverId = browseServerId();
  if (!serverId) return;
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

/** Plays what a CarPlay row stands for. */
export async function carPlayPlay(id: string): Promise<void> {
  const [kind, parts] = parseNode(id);
  switch (kind) {
    case 'playall': playShown(parts[0], 0, false); return;
    case 'shuffle': playShown(parts[0], 0, true); return;
    case 'track': playShown(parts[0], Number(parts[1]), false); return;
    case 'random': await playRandomMix(); return;
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
}
