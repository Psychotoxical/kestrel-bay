/**
 * ⚠️ Android territory. What Android Auto can show and play while Psysonic is closed.
 *
 * Android Auto starts only Psysonic's car service (`src-tauri/android/PsysonicAutoService.kt`);
 * the web view, which builds the car's lists, comes with the app's window, and Android does not
 * let a background app open its window. So the web view leaves a copy for the car: the lists
 * the car opens most (tabs, Start, playlists, mixes, downloads, radio, the albums and playlists
 * behind them) with the tracks they play, and the queue to resume. The car service shows these
 * lists and plays them with its own player (`PsysonicCarPlayer.kt`) until the app is opened;
 * then the app takes over the car player's queue and position (`takeCarPlayer`), once its own
 * startup queue restore is through (it would replace the queue otherwise).
 */
import { emit } from '@tauri-apps/api/event';
import {
  carPlayFavoriteTracks,
  carPlayOfflineTracks,
  carPlayRandomMixTracks,
  carPlayShownStation,
  carPlayShownTracks,
} from '@/features/mobileShell/car/carplayContent';
import { carListJson } from '@/features/mobileShell/android/androidAuto';
import { usePlayerStore, resolveQueueTrack } from '@/features/playback';
import { submitTrackScrobble } from '@/features/playback/store/submitTrackScrobble';
import { startupQueueSettled } from '@/features/playback/store/startupQueueSettled';
import { playbackCacheKeyForTrack } from '@/features/playback/utils/playback/playbackServer';
import { resolvePlaybackUrl } from '@/features/playback/utils/playback/resolvePlaybackUrl';
import { buildStreamUrlForServer } from '@/lib/api/subsonicStreamUrl';
import { frontendDebugLog } from '@/lib/api/debugLog';
import type { Track } from '@/lib/media/trackTypes';
import { IS_ANDROID } from '@/lib/util/platform';

interface CarSnapshotHost {
  /** Older app builds lack them. */
  saveCarSnapshot?(json: string): void;
  saveCarResume?(json: string): void;
  /** Stops the car player and returns its queue (`CarHandover`), or '' when it played nothing. */
  takeCarPlayer?(): string;
}

function host(): CarSnapshotHost | undefined {
  return (window as unknown as { PsysonicAndroidMedia?: CarSnapshotHost }).PsysonicAndroidMedia;
}

/** One track as the car player plays it; `track` comes back with the handover. */
export interface CarSnapshotTrack {
  track: Track;
  /** Where the app would play it from: a `psysonic-local://` file or the server stream. */
  url: string;
  /** The server stream, for a local file that is gone by the time the car plays it. */
  stream: string;
  /** Absolute path of the album cover on disk, or ''. */
  cover: string;
}

interface CarListRow { node: string; title: string; subtitle: string; browse: boolean; image: string }
interface CarListSection { header: string; grid: boolean; items: CarListRow[] }
interface CarListPayload { sections: CarListSection[] }

export interface CarSnapshot {
  v: 1;
  savedAt: number;
  /** The car's lists by node, in the shape `carListJson` sends. */
  lists: Record<string, CarListPayload>;
  /** Track lists by what plays them: a list node (album, playlist), `random`, `favorites`, `offline|<n>`. */
  plays: Record<string, CarSnapshotTrack[]>;
  /** Radio stations by their row's index. */
  stations: Record<string, { name: string; url: string; image: string }>;
}

export interface CarResume {
  tracks: CarSnapshotTrack[];
  index: number;
  positionSecs: number;
}

/** Lists the car service may show from the copy; artist, album and genre catalogues are the whole library. */
const WALK_KINDS = new Set(['tabs', 'home', 'library', 'playlists', 'mix', 'downloads', 'radio', 'feed', 'album', 'playlist']);
const MAX_ALBUMS = 80;
const MAX_PLAYLISTS = 40;
const MAX_LISTS = 160;
/** Queue tracks kept for resuming, from the playing one on. */
const RESUME_TRACKS = 200;
/** The copy is rebuilt at most this often (it reads a few hundred lists' worth of the index). */
const SNAPSHOT_MIN_INTERVAL_MS = 10 * 60 * 1000;
const SNAPSHOT_FIRST_DELAY_MS = 30 * 1000;
const RESUME_DELAY_MS = 2000;

const kindOf = (node: string) => node.split('|')[0];
const partsOf = (node: string) => node.split('|').slice(1).map(decodeURIComponent);

/** Only what the app needs to queue the track again after the handover. */
function slimTrack(track: Track): Track {
  const {
    id, title, artist, album, albumId, artistId, duration, coverArt, discNumber, track: no, year,
    genre, starred, serverId, replayGainTrackDb, replayGainAlbumDb, replayGainPeak, suffix, bitRate,
  } = track;
  return {
    id, title, artist, album, albumId, artistId, duration, coverArt, discNumber, track: no, year,
    genre, starred, serverId, replayGainTrackDb, replayGainAlbumDb, replayGainPeak, suffix, bitRate,
  };
}

function snapshotTrack(track: Track, covers: Map<string, string>, serverKey?: string): CarSnapshotTrack {
  const sid = serverKey || playbackCacheKeyForTrack(track);
  const url = track.directStreamUrl ?? resolvePlaybackUrl(track.id, sid);
  return {
    track: slimTrack(track),
    url,
    stream: url.startsWith('psysonic-local://') ? buildStreamUrlForServer(sid, track.id) : url,
    cover: covers.get(track.albumId) ?? '',
  };
}

/** Album covers the lists carry, by album id, for the car player's now-playing screen. */
function coversFromLists(lists: Record<string, CarListPayload>): Map<string, string> {
  const covers = new Map<string, string>();
  for (const list of Object.values(lists)) {
    for (const section of list.sections) {
      for (const row of section.items) {
        if (row.image && kindOf(row.node) === 'album') covers.set(partsOf(row.node)[1] ?? '', row.image);
      }
    }
  }
  return covers;
}

function playableInCopy(node: string, snapshot: CarSnapshot): boolean {
  const kind = kindOf(node);
  const [first] = partsOf(node);
  switch (kind) {
    case 'playall':
    case 'shuffle':
    case 'track': return (snapshot.plays[first]?.length ?? 0) > 0;
    case 'random':
    case 'luckymix': return (snapshot.plays.random?.length ?? 0) > 0;
    case 'favplay': return (snapshot.plays.favorites?.length ?? 0) > 0;
    case 'resume': return true;
    case 'radio': return !!snapshot.stations[first];
    case 'offline': return (snapshot.plays[node]?.length ?? 0) > 0;
    default: return false;
  }
}

/** Rows the copy cannot answer go, so the car never opens a list that is not there. */
function pruneLists(snapshot: CarSnapshot): void {
  for (const list of Object.values(snapshot.lists)) {
    list.sections = list.sections
      .map(section => ({
        ...section,
        items: section.items.filter(row => (row.browse ? !!snapshot.lists[row.node] : playableInCopy(row.node, snapshot))),
      }))
      .filter(section => section.items.length > 0);
  }
}

export async function buildCarSnapshot(): Promise<CarSnapshot> {
  const snapshot: CarSnapshot = { v: 1, savedAt: Date.now(), lists: {}, plays: {}, stations: {} };
  const queue = ['tabs'];
  const queued = new Set(queue);
  let albums = 0;
  let playlists = 0;
  const playRows = new Set<string>();
  while (queue.length > 0 && Object.keys(snapshot.lists).length < MAX_LISTS) {
    const node = queue.shift()!;
    const list = JSON.parse(await carListJson(node)) as CarListPayload;
    snapshot.lists[node] = list;
    for (const section of list.sections) {
      for (const row of section.items) {
        if (!row.browse) {
          playRows.add(row.node);
          continue;
        }
        const kind = kindOf(row.node);
        if (queued.has(row.node) || !WALK_KINDS.has(kind)) continue;
        if (kind === 'album' && ++albums > MAX_ALBUMS) continue;
        if (kind === 'playlist' && ++playlists > MAX_PLAYLISTS) continue;
        queued.add(row.node);
        queue.push(row.node);
      }
    }
  }
  const covers = coversFromLists(snapshot.lists);
  for (const node of Object.keys(snapshot.lists)) {
    const tracks = carPlayShownTracks(node);
    if (tracks?.length) snapshot.plays[node] = tracks.map(track => snapshotTrack(track, covers));
  }
  for (const node of playRows) {
    const kind = kindOf(node);
    const [first] = partsOf(node);
    if ((kind === 'random' || kind === 'luckymix') && !snapshot.plays.random) {
      const mix = await carPlayRandomMixTracks().catch(() => []);
      snapshot.plays.random = mix.map(track => snapshotTrack(track, covers));
    } else if (kind === 'favplay' && !snapshot.plays.favorites) {
      const favorites = await carPlayFavoriteTracks().catch(() => []);
      snapshot.plays.favorites = favorites.map(track => snapshotTrack(track, covers));
    } else if (kind === 'offline') {
      const offline = await carPlayOfflineTracks(Number(first)).catch(() => null);
      if (offline) snapshot.plays[node] = offline.tracks.map(track => snapshotTrack(track, covers, offline.serverKey));
    } else if (kind === 'radio') {
      const station = carPlayShownStation(Number(first));
      if (station?.streamUrl) snapshot.stations[first] = { name: station.name, url: station.streamUrl, image: '' };
    }
  }
  pruneLists(snapshot);
  return snapshot;
}

export function buildCarResume(): CarResume | null {
  const { queueItems, queueIndex, currentTime, currentRadio } = usePlayerStore.getState();
  if (currentRadio || queueItems.length === 0 || queueIndex < 0) return null;
  const refs = queueItems.slice(queueIndex, queueIndex + RESUME_TRACKS);
  return {
    tracks: refs.map(ref => snapshotTrack(resolveQueueTrack(ref), new Map(), ref.serverId)),
    index: 0,
    positionSecs: currentTime,
  };
}

/** A queue the car player played: the app plays on from the same spot and scrobbles what it heard. */
interface CarHandover {
  tracks: Track[];
  index: number;
  positionSecs: number;
  playing: boolean;
  played: Array<{ track: Track; startedAtMs: number }>;
}

/** The car player's queue reaches the app's player once that track is playing. */
const HANDOVER_START_TIMEOUT_MS = 15000;
/** A startup restore that never finishes must not keep the car player going for good. */
const HANDOVER_WAIT_LIMIT_MS = 30000;

export function applyCarHandover(handover: CarHandover): void {
  for (const { track, startedAtMs } of handover.played) {
    submitTrackScrobble(track, playbackCacheKeyForTrack(track), startedAtMs);
  }
  const target = handover.tracks[handover.index];
  if (!target) return;
  usePlayerStore.getState().playTrack(target, handover.tracks, true, false, handover.index);
  const startedAt = Date.now();
  const off = usePlayerStore.subscribe(state => {
    if (Date.now() - startedAt > HANDOVER_START_TIMEOUT_MS) {
      off();
      return;
    }
    if (!state.isPlaying || state.currentTrack?.id !== target.id) return;
    off();
    if (handover.positionSecs > 1) void emit('media:seek-absolute', handover.positionSecs);
    if (!handover.playing) state.pause();
  });
}

/** Keeps the car's copy current; returns the cleanup. */
export function installAndroidAutoSnapshot(): () => void {
  if (!IS_ANDROID) return () => {};
  let lastSnapshot = 0;
  let building = false;
  const saveSnapshot = async () => {
    const save = host()?.saveCarSnapshot;
    if (!save || building || Date.now() - lastSnapshot < SNAPSHOT_MIN_INTERVAL_MS) return;
    building = true;
    const startedAt = performance.now();
    try {
      const snapshot = await buildCarSnapshot();
      const json = JSON.stringify(snapshot);
      host()?.saveCarSnapshot?.(json);
      lastSnapshot = Date.now();
      frontendDebugLog('car', JSON.stringify({
        step: 'snapshot',
        ms: Math.round(performance.now() - startedAt),
        lists: Object.keys(snapshot.lists).length,
        plays: Object.keys(snapshot.plays).length,
        kb: Math.round(json.length / 1024),
      }));
    } catch (e) {
      frontendDebugLog('car', JSON.stringify({ step: 'snapshot', error: String(e) }));
    } finally {
      building = false;
    }
  };
  const saveResume = () => {
    const resume = buildCarResume();
    if (resume) host()?.saveCarResume?.(JSON.stringify(resume));
  };
  let resumeTimer: ReturnType<typeof setTimeout> | undefined;
  const offPlayer = usePlayerStore.subscribe((state, prev) => {
    if (state.currentTrack?.id === prev.currentTrack?.id && state.isPlaying === prev.isPlaying
      && state.queueItems === prev.queueItems) return;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(saveResume, RESUME_DELAY_MS);
  });
  const onVisibility = () => {
    if (document.visibilityState !== 'hidden') return;
    saveResume();
    void saveSnapshot();
  };
  document.addEventListener('visibilitychange', onVisibility);
  const firstTimer = setTimeout(() => void saveSnapshot(), SNAPSHOT_FIRST_DELAY_MS);
  let disposed = false;
  void Promise.race([startupQueueSettled, new Promise(resolve => setTimeout(resolve, HANDOVER_WAIT_LIMIT_MS))])
    .then(() => {
      const json = disposed ? '' : host()?.takeCarPlayer?.() ?? '';
      if (!json) return;
      frontendDebugLog('car', JSON.stringify({ step: 'handover' }));
      applyCarHandover(JSON.parse(json) as CarHandover);
    })
    .catch(e => frontendDebugLog('car', JSON.stringify({ step: 'handover', error: String(e) })));
  return () => {
    disposed = true;
    offPlayer();
    clearTimeout(resumeTimer);
    clearTimeout(firstTimer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
