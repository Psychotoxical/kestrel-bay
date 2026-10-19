import {
  usePlayerStore,
  shuffleTracks,
  withQueueSource,
} from '@/features/playback';
import { usePlaylistStore, resolvePlaylistTracks } from '@/features/playlist';
import { runLocalLiveSearch, runNetworkLiveSearch } from '@/lib/library/liveSearchLocal';
import { getLibraryBrowseScope } from '@/lib/library/libraryBrowseScope';
import type { SearchResults, SubsonicSong } from '@/lib/api/subsonicTypes';
import { songToTrack } from '@/lib/media/songToTrack';
import { resolveAlbum } from '@/store/mediaResolver';
import { useAuthStore } from '@/store/authStore';
import { carPlayPlay } from './carplayContent';

/** What Siri understood (`siri:play`); `mediaType` is `INMediaItemType`. */
export interface SiriPlayRequest {
  mediaName?: string | null;
  mediaType: number;
  artistName?: string | null;
  albumName?: string | null;
}

const MEDIA_SONG = 1;
const MEDIA_ALBUM = 2;
const MEDIA_ARTIST = 3;
const MEDIA_PLAYLIST = 5;

const same = (a: string | undefined | null, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Local index first, the server's search when the index has nothing. */
async function search(query: string): Promise<SearchResults> {
  const serverId = useAuthStore.getState().activeServerId;
  const local = await runLocalLiveSearch(serverId, query, { epoch: Date.now(), isStale: () => false, suppressLog: true }, getLibraryBrowseScope())
    .catch(() => null);
  if (local && (local.songs.length > 0 || local.albums.length > 0 || local.artists.length > 0)) return local;
  return (await runNetworkLiveSearch(query).catch(() => null)) ?? { artists: [], albums: [], songs: [] };
}

function playSongs(songs: SubsonicSong[], shuffle: boolean): boolean {
  const tracks = songs.map(songToTrack);
  if (tracks.length === 0) return false;
  const queue = shuffle ? shuffleTracks(tracks) : tracks;
  usePlayerStore.getState().playTrack(queue[0], queue);
  return true;
}

async function playAlbum(album: { id: string; serverId?: string }): Promise<boolean> {
  const serverId = album.serverId ?? useAuthStore.getState().activeServerId;
  if (!serverId) return false;
  const resolved = await resolveAlbum(serverId, album.id);
  const tracks = (resolved?.songs ?? []).map(song => ({ ...songToTrack(song), serverId: song.serverId ?? serverId }));
  if (tracks.length === 0) return false;
  withQueueSource({ kind: 'album', id: album.id, serverId }, () => usePlayerStore.getState().playTrack(tracks[0], tracks));
  return true;
}

async function playPlaylist(name: string): Promise<boolean> {
  const store = usePlaylistStore.getState();
  if (store.playlists.length === 0) await store.fetchPlaylists();
  const playlist = usePlaylistStore.getState().playlists.find(p => same(p.name, name));
  if (!playlist) return false;
  const tracks = await resolvePlaylistTracks(playlist.id, playlist.serverId);
  if (tracks.length === 0) return false;
  withQueueSource({ kind: 'playlist', id: playlist.id, serverId: playlist.serverId }, () => usePlayerStore.getState().playTrack(tracks[0], tracks));
  return true;
}

/**
 * Plays what a Siri request asks for: a playlist, album, artist (a shuffle of their songs
 * among the hits) or song by name; an unspecific request ("play some music") starts the
 * random mix. Returns whether anything started.
 */
export async function playSiriRequest(request: SiriPlayRequest): Promise<boolean> {
  const query = request.mediaName?.trim() || request.artistName?.trim() || request.albumName?.trim();
  if (!query) {
    await carPlayPlay('random');
    return true;
  }
  if (request.mediaType === MEDIA_PLAYLIST && await playPlaylist(query)) return true;

  const hits = await search(query);
  const artist = hits.artists.find(a => same(a.name, query));
  const album = hits.albums.find(a => same(a.name, query));
  const song = hits.songs.find(s => same(s.title, query));
  const artistSongs = (id: string) => hits.songs.filter(s => s.artistId === id);

  const byType: Array<() => Promise<boolean> | boolean> = [];
  const asArtist = () => {
    const found = artist ?? hits.artists[0];
    return found ? playSongs(artistSongs(found.id), true) : false;
  };
  const asAlbum = () => {
    const found = album ?? hits.albums[0];
    return found ? playAlbum(found) : false;
  };
  const asSong = () => {
    const found = song ?? hits.songs[0];
    return found ? playSongs([found, ...hits.songs.filter(s => s.id !== found.id)], false) : false;
  };
  if (request.mediaType === MEDIA_ARTIST) byType.push(asArtist, asAlbum, asSong);
  else if (request.mediaType === MEDIA_ALBUM) byType.push(asAlbum, asSong, asArtist);
  else if (request.mediaType === MEDIA_SONG) byType.push(asSong, asAlbum, asArtist);
  else if (artist) byType.push(asArtist, asAlbum, asSong);
  else if (album) byType.push(asAlbum, asSong, asArtist);
  else byType.push(asSong, asAlbum, asArtist);

  for (const attempt of byType) {
    if (await attempt()) return true;
  }
  return false;
}
