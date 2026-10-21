import {
  usePlayerStore,
  shuffleTracks,
  withQueueSource,
} from '@/features/playback';
import { usePlaylistStore, resolvePlaylistTracks } from '@/features/playlist';
import { runLocalLiveSearch, runNetworkLiveSearch } from '@/lib/library/liveSearchLocal';
import { getLibraryBrowseScope } from '@/lib/library/libraryBrowseScope';
import { libraryScopeListArtists } from '@/lib/api/library/scopeReads';
import type { SearchResults, SubsonicSong } from '@/lib/api/subsonicTypes';
import { songToTrack } from '@/lib/media/songToTrack';
import { resolveAlbum } from '@/store/mediaResolver';
import { useAuthStore } from '@/store/authStore';
import { frontendDebugLog } from '@/lib/api/debugLog';
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

/**
 * Siri sometimes leaves the app name in the request ("… mit Psychic": it heard "Psysonic"
 * as a word it knows; "Metallica and Psychic" for "Metallica in Psysonic", car test 21.10.). A trailing "<with|in|on|…> <app name or mishearing>" is not part of
 * the title.
 */
const APP_NAME_TAIL = /\s+(?:mit|in|im|auf|bei|via|über|und|on|with|using|and)\s+(?:psy\s?sonic|psysonik|psychonic|psychic)\s*$/i;

export function stripSpokenAppName(name: string | null | undefined): string | undefined {
  const cleaned = name?.replace(APP_NAME_TAIL, '').trim();
  return cleaned || undefined;
}

const hasHits = (r: SearchResults | null): r is SearchResults =>
  !!r && (r.songs.length > 0 || r.albums.length > 0 || r.artists.length > 0);

/**
 * Local index first, the server's search when the index has nothing that fits. The local
 * search suggests while typing: any word counts and it returns ten songs, so a spoken title
 * ("Waiting On Love") can drown among hits for one of its words ("Love Machine"). The
 * server's search wants every word, so it is asked whenever no local hit `fits`.
 */
async function search(query: string, fits: (hits: SearchResults) => boolean): Promise<SearchResults> {
  const serverId = useAuthStore.getState().activeServerId;
  const local = await runLocalLiveSearch(serverId, query, { epoch: Date.now(), isStale: () => false, suppressLog: true }, getLibraryBrowseScope())
    .catch(() => null);
  if (hasHits(local) && fits(local)) return local;
  const network = await runNetworkLiveSearch(query).catch(() => null);
  if (hasHits(network) && (fits(network) || !hasHits(local))) return network;
  return local ?? network ?? { artists: [], albums: [], songs: [] };
}

/** Lower case, no accents or punctuation: "Motörhead" and "motorhead" compare equal. */
export function normalizeSpoken(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * How well one name (Siri's mishearing included) matches another: 2 = equal, 1 = same start
 * of at least four letters ("Motörhead" for "Motorjesus"), 0 = unrelated.
 */
function nameCloseness(heard: string, actual: string | null | undefined): number {
  const a = normalizeSpoken(heard).replace(/ /g, '');
  const b = normalizeSpoken(actual).replace(/ /g, '');
  if (!a || !b) return 0;
  if (a === b) return 2;
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common += 1;
  return common >= 4 ? 1 : 0;
}

/**
 * Score of a hit for a spoken request like "<artist> <title>" or "<title> <artist>": the
 * title (song or album name) must be part of what was said, the rest should sound like the
 * hit's artist. Titles weigh more than artists; 0 = the title does not occur at all.
 */
export function spokenMatchScore(
  query: string,
  title: string | null | undefined,
  artist: string | null | undefined,
  artistHint?: string | null,
): number {
  const q = ` ${normalizeSpoken(query)} `;
  const t = normalizeSpoken(title);
  if (!t || !q.includes(` ${t} `)) return 0;
  const exact = q.trim() === t;
  const rest = q.replace(` ${t} `, ' ').trim();
  const heardArtist = artistHint || rest;
  const artistScore = heardArtist ? nameCloseness(heardArtist, artist) : 0;
  return (exact ? 30 : 20) + artistScore * 5;
}

function best<T>(items: T[], score: (item: T) => number): { item?: T; score: number } {
  let found: T | undefined;
  let top = 0;
  for (const item of items) {
    const s = score(item);
    if (s > top) { top = s; found = item; }
  }
  return { item: found, score: top };
}

function playSongs(songs: SubsonicSong[], shuffle: boolean): boolean {
  const tracks = songs.map(songToTrack);
  if (tracks.length === 0) return false;
  const queue = shuffle ? shuffleTracks(tracks) : tracks;
  usePlayerStore.getState().playTrack(queue[0], queue);
  return true;
}

async function playAlbum(album: { id: string; serverId?: string }, startSongId?: string): Promise<boolean> {
  const serverId = album.serverId ?? useAuthStore.getState().activeServerId;
  if (!serverId) return false;
  const resolved = await resolveAlbum(serverId, album.id);
  const tracks = (resolved?.songs ?? []).map(song => ({ ...songToTrack(song), serverId: song.serverId ?? serverId }));
  if (tracks.length === 0) return false;
  const start = tracks.find(t => t.id === startSongId) ?? tracks[0];
  withQueueSource({ kind: 'album', id: album.id, serverId }, () => usePlayerStore.getState().playTrack(start, tracks));
  return true;
}

/** A song, then the rest of its album (not unrelated search hits that share a word). */
async function playSongInAlbum(song: SubsonicSong): Promise<boolean> {
  if (song.albumId && await playAlbum({ id: song.albumId, serverId: song.serverId }, song.id)) return true;
  return playSongs([song], false);
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
 * random mix. Siri often hands over artist and title as one name ("Motörhead Streets of
 * Fire", misheard for Motorjesus), so hits are ranked by title and artist together. A song
 * plays on with its album. Returns whether anything started.
 */
export async function playSiriRequest(request: SiriPlayRequest): Promise<boolean> {
  // Steps with their time since the request: the car test of 21.10. took 59 s to play.
  const startedAt = performance.now();
  const step = (name: string, details?: Record<string, unknown>) => frontendDebugLog(
    'siri', JSON.stringify({ step: name, ms: Math.round(performance.now() - startedAt), ...details }),
  );
  step('received', { mediaType: request.mediaType });
  const played = await playSiriRequestSteps(request, step);
  step(played ? 'playing' : 'nothing-found');
  return played;
}

async function playSiriRequestSteps(
  request: SiriPlayRequest,
  step: (name: string, details?: Record<string, unknown>) => void,
): Promise<boolean> {
  const query = stripSpokenAppName(request.mediaName)
    ?? stripSpokenAppName(request.artistName)
    ?? stripSpokenAppName(request.albumName);
  if (!query) {
    await carPlayPlay('random');
    return true;
  }
  if (request.mediaType === MEDIA_PLAYLIST && await playPlaylist(query)) return true;

  const artistHint = request.mediaName ? stripSpokenAppName(request.artistName) : undefined;
  const hits = await search(query, found =>
    found.artists.some(a => same(a.name, query))
    || found.albums.some(a => spokenMatchScore(query, a.name, a.artist, artistHint) > 0)
    || found.songs.some(s => spokenMatchScore(query, s.title, s.artist, artistHint) > 0));
  step('searched', { artists: hits.artists.length, albums: hits.albums.length, songs: hits.songs.length });
  const artist = hits.artists.find(a => same(a.name, query));
  const album = best(hits.albums, a => spokenMatchScore(query, a.name, a.artist, artistHint));
  const song = best(hits.songs, s => spokenMatchScore(query, s.title, s.artist, artistHint));
  const artistSongs = (id: string) => hits.songs.filter(s => s.artistId === id);

  const asArtist = () => {
    const found = artist ?? hits.artists[0];
    return found ? playSongs(artistSongs(found.id), true) : false;
  };
  const asAlbum = () => {
    const found = album.item ?? hits.albums[0];
    return found ? playAlbum(found) : false;
  };
  const asSong = () => {
    const found = song.item ?? hits.songs[0];
    return found ? playSongInAlbum(found) : false;
  };

  const byType: Array<() => Promise<boolean> | boolean> = [];
  if (request.mediaType === MEDIA_ARTIST) byType.push(asArtist, asAlbum, asSong);
  else if (request.mediaType === MEDIA_ALBUM) byType.push(asAlbum, asSong, asArtist);
  else if (request.mediaType === MEDIA_SONG) byType.push(asSong, asAlbum, asArtist);
  else if (artist) byType.push(asArtist, asAlbum, asSong);
  // Album over song on a tie: "<artist> <album>" with a title track starts the album at 1.
  else if (album.score > 0 && album.score >= song.score) byType.push(asAlbum, asSong, asArtist);
  else byType.push(asSong, asAlbum, asArtist);

  for (const attempt of byType) {
    if (await attempt()) return true;
  }
  return false;
}

/** Siri learns at most this many artist names; the ones with most albums go first. */
export const SIRI_VOCABULARY_LIMIT = 1000;

/**
 * Artist names from the local library for Siri's speech recognition (`siri:vocabulary`),
 * so it hears the user's own artists ("Motorjesus") instead of names it already knows.
 */
export async function siriArtistVocabulary(): Promise<string[]> {
  const serverId = useAuthStore.getState().activeServerId;
  if (!serverId) return [];
  const artists = await libraryScopeListArtists(serverId, {
    scopes: getLibraryBrowseScope().pairs,
    sort: 'name',
    limit: 10_000,
  }).catch(() => []);
  const seen = new Set<string>();
  return [...artists]
    .sort((a, b) => (b.albumCount ?? 0) - (a.albumCount ?? 0))
    .map(a => a.name.trim())
    .filter(name => {
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SIRI_VOCABULARY_LIMIT);
}
