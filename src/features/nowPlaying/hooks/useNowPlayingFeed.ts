import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getNowPlayingForServers } from '@/lib/api/subsonicScrobble';
import type { SubsonicNowPlaying } from '@/lib/api/subsonicTypes';
import { useAuthStore } from '@/store/authStore';
import { deriveEffectiveLibraryBrowseServerIds } from '@/lib/library/libraryBrowseScope';
import { useUnavailableServerIds } from '@/lib/network/serverReachability';
import { usePlayerStore } from '@/features/playback';
import { serverListDisplayLabel } from '@/lib/server/serverDisplayName';
import { findServerByIdOrIndexKey } from '@/lib/server/serverLookup';
import { FEATURE_PLAYBACK_REPORT } from '@/lib/serverCapabilities/catalog';
import { isFeatureActiveForServer } from '@/lib/serverCapabilities/storeView';

const LIVE_POLL_OPEN_MS = 10_000;
const LIVE_POLL_BACKGROUND_MS = 30_000;

export interface NowPlayingGroup {
  serverId: string;
  serverLabel: string;
  rows: SubsonicNowPlaying[];
}

export interface NowPlayingFeed {
  /** Entries worth showing: not stopped; on a server without stop reports, your own only while you play there. */
  visible: SubsonicNowPlaying[];
  /** `visible` per server, in scope order, empty servers left out. */
  visibleGroups: NowPlayingGroup[];
  /** More than one server in the browse scope (rows get a server heading). */
  multiServerScope: boolean;
  loading: boolean;
  /** The refresh icon spins a little past the request. */
  spinning: boolean;
  handleRefresh: () => void;
  /** Position now, in seconds: `playing` entries advance locally between polls. */
  livePositionSec: (entry: SubsonicNowPlaying) => number | undefined;
}

export function formatNowPlayingClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * "Who is listening?" — the server's now-playing entries for every server in the
 * browse scope. Polls while the page is visible: every 30 s for the trigger
 * badge, every 10 s while the list is open.
 */
export function useNowPlayingFeed(isOpen: boolean): NowPlayingFeed {
  const [nowPlaying, setNowPlaying] = useState<SubsonicNowPlaying[]>([]);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const playbackServerKey = usePlayerStore(s => s.queueItems[s.queueIndex]?.serverId ?? s.queueServerId ?? '');
  const servers = useAuthStore(s => s.servers);
  const activeServerId = useAuthStore(s => s.activeServerId);
  const libraryBrowseServerIds = useAuthStore(s => s.libraryBrowseServerIds);
  const unavailableServerIds = useUnavailableServerIds();
  const effectiveLibraryServerIds = useMemo(() => deriveEffectiveLibraryBrowseServerIds({
    servers,
    activeServerId,
    libraryBrowseServerIds,
  }, unavailableServerIds), [activeServerId, libraryBrowseServerIds, servers, unavailableServerIds]);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  // Wall-clock baseline for the last poll: between polls we extrapolate the
  // position of `playing` entries locally so the progress bar glides instead
  // of snapping. The server already extrapolates positionMs at fetch time.
  const fetchedAtRef = useRef(0);
  const requestSeqRef = useRef(0);
  const [, forceTick] = useState(0);

  // Live position in seconds: advance `playing` entries by elapsed × playbackRate
  // since the last poll; freeze everything else at the reported position.
  const livePositionSec = (entry: SubsonicNowPlaying): number | undefined => {
    if (typeof entry.positionMs !== 'number') return undefined;
    let ms = entry.positionMs;
    if (entry.state === 'playing') {
      const rate = entry.playbackRate && entry.playbackRate > 0 ? entry.playbackRate : 1;
      ms += (Date.now() - fetchedAtRef.current) * rate;
    }
    const maxMs = entry.duration > 0 ? entry.duration * 1000 : ms;
    return Math.min(ms, maxMs) / 1000;
  };

  const fetchNowPlaying = useCallback(async (opts?: { silent?: boolean }) => {
    const requestSeq = ++requestSeqRef.current;
    if (!opts?.silent) setLoading(true);
    try {
      const data = await getNowPlayingForServers(effectiveLibraryServerIds);
      if (requestSeq !== requestSeqRef.current) return;
      fetchedAtRef.current = Date.now();
      setNowPlaying(data);
    } catch (e) {
      console.error('Failed to load Now Playing', e);
    } finally {
      if (!opts?.silent && requestSeq === requestSeqRef.current) setLoading(false);
    }
  }, [effectiveLibraryServerIds]);

  const handleRefresh = () => {
    setSpinning(true);
    fetchNowPlaying().finally(() => {
      setTimeout(() => setSpinning(false), 600);
    });
  };

  // Poll while the page is visible: every 30 s for the header badge, every 10 s
  // while the popover is open so the list stays fresher.
  useEffect(() => {
    const poll = (silent: boolean) => {
      if (document.visibilityState === 'visible') void fetchNowPlaying({ silent });
    };

    poll(!isOpen);
    const intervalMs = isOpen ? LIVE_POLL_OPEN_MS : LIVE_POLL_BACKGROUND_MS;
    const id = setInterval(() => poll(true), intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') poll(true);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isOpen, fetchNowPlaying]);

  // Re-render once per second while a `playing` entry exposes a position, so the
  // locally-extrapolated bar advances smoothly between polls.
  const hasLivePosition = nowPlaying.some(
    e => e.state === 'playing' && typeof e.positionMs === 'number',
  );
  useEffect(() => {
    if (!isOpen || !hasLivePosition) return;
    const id = setInterval(() => forceTick(v => v + 1), 1000);
    return () => clearInterval(id);
  }, [isOpen, hasLivePosition]);

  // For the current user on a server without the playbackReport extension, trust
  // the local player state — such a server keeps stale "now playing" entries for
  // minutes after playback stops. With the extension, this install reports its own
  // stop, so own-account rows (other devices, or this install while it plays or is
  // paused) show like anyone else's.
  const playbackServerId = findServerByIdOrIndexKey(playbackServerKey)?.id ?? playbackServerKey;
  const ownUsernameByServer = new Map(servers.map(server => [server.id, server.username]));
  const serverLabelById = new Map(servers.map(server => [server.id, serverListDisplayLabel(server, servers)]));
  const multiServerScope = effectiveLibraryServerIds.length > 1;
  const visible = nowPlaying.filter(entry => {
    if (entry.state === 'stopped') return false;
    const entryServerId = entry.serverId ?? '';
    const ownUsername = ownUsernameByServer.get(entryServerId);
    if (!ownUsername || entry.username !== ownUsername) return true;
    if (isFeatureActiveForServer(entryServerId, FEATURE_PLAYBACK_REPORT)) return true;
    return entryServerId === playbackServerId && isPlaying;
  });
  const visibleByServer = new Map<string, SubsonicNowPlaying[]>();
  for (const entry of visible) {
    const serverId = entry.serverId ?? '';
    const rows = visibleByServer.get(serverId);
    if (rows) rows.push(entry);
    else visibleByServer.set(serverId, [entry]);
  }
  const visibleGroups = effectiveLibraryServerIds
    .map(serverId => ({
      serverId,
      serverLabel: serverLabelById.get(serverId) ?? serverId,
      rows: visibleByServer.get(serverId) ?? [],
    }))
    .filter(group => group.rows.length > 0);

  return { visible, visibleGroups, multiServerScope, loading, spinning, handleRefresh, livePositionSec };
}
