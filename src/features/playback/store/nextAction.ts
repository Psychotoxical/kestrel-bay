import {
  getSimilarSongs2ForServer,
  getTopSongsForServer,
} from '@/lib/api/subsonicArtists';
import { audioStop } from '@/lib/api/audio';
import { buildInfiniteQueueCandidates } from '@/features/playback/utils/playback/buildInfiniteQueueCandidates';
import { songToTrack } from '@/lib/media/songToTrack';
import {
  ensureQueueServerPinned,
  playbackProfileIdForTrack,
} from '@/features/playback/utils/playback/playbackServer';
import { useAuthStore } from '@/store/authStore';
import {
  getPlayGeneration,
  setIsAudioPaused,
} from '@/features/playback/store/engineState';
import {
  isInfiniteQueueFetching,
  setInfiniteQueueFetching,
} from '@/features/playback/store/infiniteQueueState';
import { isInOrbitSession } from '@/store/orbitRuntime';
import type { QueueItemRef, Track } from '@/lib/media/trackTypes';
import type { PlayerState } from '@/features/playback/store/playerStoreTypes';
import { toQueueItemRefs } from '@/features/playback/store/queueItemRef';
import { resolveQueueTrack } from '@/features/playback/store/queueTrackView';
import { seedQueueResolver } from '@/features/playback/store/queueTrackResolver';
import {
  addRadioSessionSeen,
  getCurrentRadioArtistId,
  getCurrentRadioServerId,
  hasRadioSessionSeen,
  isRadioFetching,
  setRadioFetching,
} from '@/features/playback/store/radioSessionState';
import { finalizePlayQueueAtTrackEnd } from '@/features/playback/store/queueSync';
import { topUpInfiniteQueueAhead } from '@/features/playback/store/infiniteQueueTopUp';
import { applySkipStarOnManualNext } from '@/features/playback/store/skipStarRating';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import {
  queueItemIdentityKey,
  queueTrackIdentityKey,
} from '@/features/playback/utils/playback/queueIdentity';

type SetState = (
  partial: Partial<PlayerState> | ((state: PlayerState) => Partial<PlayerState>),
) => void;
type GetState = () => PlayerState;

/**
 * Queue-exhausted radio / infinite-queue refill: append the freshly fetched
 * tracks to the canonical `queueItems`, seed the resolver with them (so they
 * resolve without a network round-trip), then play the first appended track at
 * its new tail index. Refs in / Track for the play call only — thin-state.
 */
function appendTracksAndPlayFirst(
  set: SetState,
  get: GetState,
  fresh: Track[],
  serverId: string,
): void {
  if (fresh.length === 0) return;
  // Pin the server *before* reading state so the appended refs (and the
  // resolver seed) carry the canonical server key — otherwise queue rows for
  // the appended tracks render as the resolver placeholder. See PR #892.
  ensureQueueServerPinned(fresh);
  const state = get();
  if (serverId) seedQueueResolver(serverId, fresh);
  const incoming: QueueItemRef[] = toQueueItemRefs(serverId, fresh);
  const playAt = state.queueItems.length;
  // Append the refs first so playTrack (queue arg undefined) reads them off the
  // canonical list and its targetQueueIndex validates against the new tail.
  set({ queueItems: [...state.queueItems, ...incoming] });
  get().playTrack(fresh[0], undefined, false, false, playAt);
}

function buildFreshRadioTracks(
  sourceList: SubsonicSong[],
  existingIdentities: Set<string>,
  serverId: string,
): Track[] {
  const fresh: Track[] = [];
  for (const raw of sourceList) {
    if (fresh.length >= 10) break;
    const track = { ...songToTrack(raw), serverId };
    const identity = queueTrackIdentityKey(track.id, serverId);
    if (existingIdentities.has(identity) || hasRadioSessionSeen(identity)) continue;
    addRadioSessionSeen(identity);
    fresh.push({ ...track, radioAdded: true as const });
  }
  return fresh;
}

/** Repeat-off queue tail: stop transport and finalize server play queue at EOF. */
function stopAtNaturalQueueEnd(set: SetState, get: GetState): void {
  const { currentTrack, queueItems } = get();
  if (currentTrack && queueItems.length > 0) {
    void finalizePlayQueueAtTrackEnd(queueItems, currentTrack);
  }
  get().stop();
}

/**
 * Advance to the next track. Three top-level outcomes:
 *
 * 1. **Has next slot** — `playTrack` the queue's `queueIndex + 1`,
 *    then proactively top up auto-added (infinite-queue) and
 *    radio-added tracks when ≤ 2 of each remain ahead. Both top-ups
 *    are skipped inside an Orbit session — the host owns the queue,
 *    and a silent local extension would drift the guest off the host
 *    or pop the bulk-add modal at the next track-end fallback.
 *
 * 2. **Queue exhausted, repeat=all** — wrap back to index 0.
 *
 * 3. **Queue exhausted, repeat=off** — stop, unless:
 *    - The current track is radio-flagged → fetch a fresh radio batch
 *      and continue.
 *    - Infinite queue is enabled → fetch more candidates and continue.
 *    - Orbit session active → stop locally and let `useOrbitGuest`
 *      sync to the host's next track.
 */
export function runNext(set: SetState, get: GetState, manual: boolean): void {
  const { queueItems, queueIndex, repeatMode, currentTrack } = get();
  applySkipStarOnManualNext(currentTrack, manual);
  const nextIdx = queueIndex + 1;
  if (nextIdx < queueItems.length) {
    // Resolver bridge keeps the [queueIndex-50, +200] window warm, so the next
    // ref is cache-hot here; resolveQueueTrack falls back to a placeholder
    // (carrying the correct trackId) on a cold miss so playback still starts.
    const nextRef = queueItems[nextIdx];
    const nextTrack = resolveQueueTrack(nextRef);
    get().playTrack(nextTrack, undefined, manual, false, nextIdx);
    const topUpGeneration = getPlayGeneration();
    const topUpServerId = playbackProfileIdForTrack(nextTrack, nextRef);
    topUpInfiniteQueueAhead(set, get, nextIdx, nextTrack);
    // Proactively top up radio tracks when ≤ 2 remain — independent of the
    // infinite-queue setting, but still skipped in Orbit: the radio top-up
    // appends unrelated tracks and trims queue history, which would drift a
    // guest off the host's playlist (same rationale as the infinite-queue
    // branch above).
    if (nextRef.radioAdded && !isRadioFetching() && !isInOrbitSession()) {
      const remainingRadio = queueItems.slice(nextIdx + 1).filter(r => r.radioAdded).length;
      if (remainingRadio <= 2) {
        // nextTrack may be a placeholder if its ref is still cold. Prefer its
        // metadata, then the stored radio seed. Only borrow currentTrack
        // metadata when it belongs to the same owner as the new playing ref.
        const currentServerId = currentTrack
          ? playbackProfileIdForTrack(currentTrack, queueItems[queueIndex])
          : '';
        const currentSharesOwner = currentServerId === topUpServerId;
        const storedSeedSharesOwner = getCurrentRadioServerId() === topUpServerId;
        const seedArtistId =
          nextTrack.artistId
          ?? (storedSeedSharesOwner ? getCurrentRadioArtistId() : undefined)
          ?? (currentSharesOwner ? currentTrack?.artistId : undefined)
          ?? null;
        const seedArtistName = nextTrack.artist
          || (currentSharesOwner ? currentTrack?.artist : '')
          || '';
        if (seedArtistId && seedArtistName) {
          setRadioFetching(true);
          Promise.all([
            getSimilarSongs2ForServer(topUpServerId, seedArtistId),
            getTopSongsForServer(topUpServerId, seedArtistName),
          ])
            .then(([similar, top]) => {
              // Re-check — the user may have joined an Orbit session between
              // scheduling this fetch and its resolution (mirrors the
              // infinite-queue branch). The finally() still clears the flag.
              if (isInOrbitSession() || getPlayGeneration() !== topUpGeneration) return;
              const existingIdentities = new Set(get().queueItems.map(queueItemIdentityKey));
              // Lead with similar (other artists) for variety; top tracks
              // of the upcoming artist are only a fallback when similar
              // is empty. Single-pass loop dedupes against the live queue,
              // the session seen-set, and intra-batch overlap (issue #500).
              const sourceList = similar.length > 0 ? similar : top;
              const fresh = buildFreshRadioTracks(sourceList, existingIdentities, topUpServerId);
              if (fresh.length > 0) {
                // Trim played tracks from the front to keep the queue bounded.
                // Without trimming the queue grows unboundedly, making every
                // Zustand persist write larger and causing UI freezes over time.
                // Keep the last HISTORY_KEEP played tracks so the user can still
                // navigate backwards a few songs. Trimmed ids stay in the seen-set.
                const HISTORY_KEEP = 5;
                // Pin before set; same reasoning as the infinite top-up above.
                ensureQueueServerPinned(fresh);
                set(state => {
                  if (topUpServerId) seedQueueResolver(topUpServerId, fresh);
                  const trimStart = Math.max(0, state.queueIndex - HISTORY_KEEP);
                  const newItems = [
                    ...state.queueItems.slice(trimStart),
                    ...toQueueItemRefs(topUpServerId, fresh),
                  ];
                  return {
                    queueItems: newItems,
                    queueIndex: state.queueIndex - trimStart,
                  };
                });
              }
            })
            .catch(() => {})
            .finally(() => { setRadioFetching(false); });
        }
      }
    }
  } else if (repeatMode === 'all' && queueItems.length > 0) {
    const firstTrack = resolveQueueTrack(queueItems[0]);
    get().playTrack(firstTrack, undefined, manual, false, 0);
  } else {
    // ── Orbit short-circuit ──
    // The host owns the shared queue. The radio / infinite-queue
    // fallbacks below would either pop the orbitBulkGuard modal (with a
    // 6-track add) or silently inject unrelated tracks into the local
    // player and drift the guest off the host. Stop instead and let the
    // next pull tick in `useOrbitGuest` sync to the host's next track.
    // Covers any active orbit phase (`active` / `joining` / `starting`)
    // so a fetch scheduled mid-join doesn't slip through.
    if (isInOrbitSession()) {
      audioStop().catch(console.error);
      setIsAudioPaused(false);
      set({ isPlaying: false, progress: 0, buffered: 0, currentTime: 0 });
      return;
    }
    // Queue exhausted. Check radio first (independent of infinite queue setting),
    // then infinite queue, then stop.
    if (currentTrack?.radioAdded && !isRadioFetching()) {
      const currentRef = queueItems[queueIndex];
      const topUpServerId = playbackProfileIdForTrack(currentTrack, currentRef);
      const storedSeedSharesOwner = getCurrentRadioServerId() === topUpServerId;
      const artistId = currentTrack.artistId
        ?? (storedSeedSharesOwner ? getCurrentRadioArtistId() : null);
      if (artistId) {
        const topUpGeneration = getPlayGeneration();
        setRadioFetching(true);
        Promise.all([
          getSimilarSongs2ForServer(topUpServerId, artistId),
          getTopSongsForServer(topUpServerId, currentTrack.artist),
        ])
          .then(([similar, top]) => {
            setRadioFetching(false);
            // The user may have joined an Orbit session while this
            // fetch was in flight — bail without touching the queue.
            if (isInOrbitSession()) {
              audioStop().catch(console.error);
              setIsAudioPaused(false);
              set({ isPlaying: false, progress: 0, buffered: 0, currentTime: 0 });
              return;
            }
            if (getPlayGeneration() !== topUpGeneration) return;
            const existingIdentities = new Set(get().queueItems.map(queueItemIdentityKey));
            // Same source preference + dedup contract as the proactive
            // top-up: similar first, top only as a fallback (issue #500).
            const sourceList = similar.length > 0 ? similar : top;
            const fresh = buildFreshRadioTracks(sourceList, existingIdentities, topUpServerId);
            if (fresh.length > 0) {
              appendTracksAndPlayFirst(set, get, fresh, topUpServerId);
            } else {
              stopAtNaturalQueueEnd(set, get);
            }
          })
          .catch(() => {
            setRadioFetching(false);
            if (getPlayGeneration() !== topUpGeneration) return;
            stopAtNaturalQueueEnd(set, get);
          });
        return;
      }
    }
    const { infiniteQueueEnabled } = useAuthStore.getState();
    if (infiniteQueueEnabled && repeatMode === 'off') {
      if (isInfiniteQueueFetching()) return;
      const currentRef = queueItems[queueIndex];
      const topUpServerId = currentTrack
        ? playbackProfileIdForTrack(currentTrack, currentRef)
        : '';
      const topUpGeneration = getPlayGeneration();
      setInfiniteQueueFetching(true);
      const existingIdentities = new Set(get().queueItems.map(queueItemIdentityKey));
      buildInfiniteQueueCandidates(currentTrack, topUpServerId, existingIdentities, 5).then(newTracks => {
        setInfiniteQueueFetching(false);
        // The user may have joined an Orbit session while this
        // fetch was in flight — bail without invoking playTrack.
        if (isInOrbitSession()) {
          audioStop().catch(console.error);
          setIsAudioPaused(false);
          set({ isPlaying: false, progress: 0, buffered: 0, currentTime: 0 });
          return;
        }
        if (getPlayGeneration() !== topUpGeneration) return;
        if (newTracks.length === 0) {
          stopAtNaturalQueueEnd(set, get);
          return;
        }
        appendTracksAndPlayFirst(set, get, newTracks, topUpServerId);
      }).catch(() => {
        setInfiniteQueueFetching(false);
        if (getPlayGeneration() !== topUpGeneration) return;
        stopAtNaturalQueueEnd(set, get);
      });
    } else {
      stopAtNaturalQueueEnd(set, get);
    }
  }
}
