import { useEffect, useRef, useState } from 'react';
import { getSongForServer } from '@/lib/api/subsonicLibrary';
import { songToTrack } from '@/lib/media/songToTrack';
import { useOrbitStore } from '@/features/orbit/store/orbitStore';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import {
  endOrbitSession,
  leaveOrbitSession,
  computeOrbitDriftMs,
  effectiveShuffleIntervalMs,
  orbitServerMatches,
} from '@/features/orbit/utils/orbit';
import { estimateLivePosition } from '@/features/orbit/api/orbit';

const CATCH_UP_DRIFT_THRESHOLD_MS = 3_000;

/**
 * Everything a session surface needs besides its markup: the 1 s tick, the
 * debounced catch-up button, catch-up itself, leaving / ending, the shuffle
 * countdown and whether a session is on screen at all. Shared by the desktop
 * session bar and the touch shell's Orbit tab.
 */
export function useOrbitSessionControls() {
  const state        = useOrbitStore(s => s.state);
  const role         = useOrbitStore(s => s.role);
  const phase        = useOrbitStore(s => s.phase);
  const serverId     = useOrbitStore(s => s.serverId);
  const errorMessage = useOrbitStore(s => s.errorMessage);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Second-level tick just for the shuffle countdown + drift readout —
  // the store itself only ticks at 2.5 s which is too coarse for a smooth
  // countdown.
  useEffect(() => {
    if (!state || phase !== 'active') return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [state, phase]);

  // ── Catch Up button visibility — debounced + hysteresis ───────────────
  // The raw drift signal is noisy: guest's `currentTime` updates in coarse
  // ~5 s chunks while host's position is extrapolated linearly via
  // `(nowMs - posAt)`, so the diff swings between ~1 s and ~8 s every
  // tick on a normal session even when both sides are perfectly synced.
  // Two-stage filter:
  //   - **Hidden → shown**: drift must stay over the show-threshold (3 s)
  //     for 3 s of wall-clock. Filters out brief over-threshold blips.
  //   - **Shown → hidden**: drift must stay under the hide-threshold
  //     (1 s) for 1 s of wall-clock. Once visible, the button persists
  //     through the 1–3 s "drift back to small" valleys that come from
  //     guest's currentTime catching up in chunks; otherwise the button
  //     would vanish too fast to actually click on a high-latency
  //     session where genuine drift fluctuates around 5–8 s.
  const SHOW_THRESHOLD_MS = CATCH_UP_DRIFT_THRESHOLD_MS;
  const HIDE_THRESHOLD_MS = 1_000;
  const SHOW_DEBOUNCE_MS = 3_000;
  const HIDE_DEBOUNCE_MS = 1_000;
  const [showCatchUp, setShowCatchUp] = useState(false);
  const overSinceRef = useRef<number | null>(null);
  const underSinceRef = useRef<number | null>(null);
  useEffect(() => {
    // Note: `state.isPlaying` is *not* a gate. A guest who joined while
    // the host was paused still benefits from Catch Up if their sync to
    // the host's paused position failed — the only signal that matters
    // is "is there drift between us and the host's last reported state".
    // `computeOrbitDriftMs` correctly stops time-extrapolation when the
    // host is paused, so the formula holds in both states.
    if (role !== 'guest' || !state || !state.currentTrack) {
      overSinceRef.current = null;
      underSinceRef.current = null;
      // React Compiler set-state-in-effect rule: local state synced with store/prop inputs when the effect’s dependencies change.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowCatchUp(false);
      return;
    }
    const player = usePlayerStore.getState();
    const localPositionMs = Math.round((player.currentTime ?? 0) * 1000);
    const sameOrbitTrack = player.currentTrack?.id === state.currentTrack.trackId
      && !!serverId
      && orbitServerMatches(serverId, player.currentTrack.serverId ?? player.queueServerId);
    const driftMs = sameOrbitTrack
      ? computeOrbitDriftMs(state, localPositionMs, nowMs)
      : null;
    const absDrift = driftMs == null ? Infinity : Math.abs(driftMs);
    if (showCatchUp) {
      // Currently visible — only hide once drift has been clearly small
      // for the full hide-debounce window.
      overSinceRef.current = null;
      if (absDrift < HIDE_THRESHOLD_MS) {
        if (underSinceRef.current === null) underSinceRef.current = Date.now();
        if (Date.now() - underSinceRef.current >= HIDE_DEBOUNCE_MS) {
          setShowCatchUp(false);
          underSinceRef.current = null;
        }
      } else {
        underSinceRef.current = null;
      }
    } else {
      // Currently hidden — only show after sustained over-threshold drift.
      underSinceRef.current = null;
      if (absDrift > SHOW_THRESHOLD_MS) {
        if (overSinceRef.current === null) overSinceRef.current = Date.now();
        if (Date.now() - overSinceRef.current >= SHOW_DEBOUNCE_MS) {
          setShowCatchUp(true);
          overSinceRef.current = null;
        }
      } else {
        overSinceRef.current = null;
      }
    }
  }, [role, serverId, state, nowMs, showCatchUp, SHOW_THRESHOLD_MS]);

  // Visible while active, ended (pre-ack), or explicitly kicked / soft-removed.
  const sessionVisible = !!state && (
    phase === 'active'
    || phase === 'ended'
    || (phase === 'error' && (errorMessage === 'kicked' || errorMessage === 'removed'))
  );

  const untilShuffleMs = state
    ? Math.max(0, (state.lastShuffle + effectiveShuffleIntervalMs(state)) - nowMs)
    : null;
  // Off: there is no next shuffle to count towards. The phone room hides its
  // countdown then; the desktop bar keeps showing it, as it always has.
  const autoShuffleOn = state?.settings?.autoShuffle !== false;

  const performExit = async () => {
    try {
      if (role === 'host') await endOrbitSession();
      else if (role === 'guest') await leaveOrbitSession();
      else useOrbitStore.getState().reset();
    } catch {
      useOrbitStore.getState().reset();
    }
  };

  /** Active-session exits deserve a confirm (a guest's fat finger, or the host ending it for everyone). */
  const exitNeedsConfirm = phase === 'active' && (role === 'guest' || role === 'host');

  const catchUp = async () => {
    if (!serverId || !state?.currentTrack) return;
    const trackId = state.currentTrack.trackId;
    const targetMs = estimateLivePosition(state, Date.now());
    const targetSec = Math.max(0, targetMs / 1000);
    const hostPlaying = state.isPlaying;
    try {
      const song = await getSongForServer(serverId, trackId);
      if (!song) return;
      const track = songToTrack(song);
      const player = usePlayerStore.getState();
      const fraction = targetSec / Math.max(1, track.duration);
      const hasOrbitTrack = () => {
        const p = usePlayerStore.getState();
        return p.currentTrack?.id === trackId
          && orbitServerMatches(serverId, p.currentTrack.serverId ?? p.queueServerId);
      };
      if (hasOrbitTrack()) {
        // `player.seek` debounces the underlying `audio_seek` invoke via
        // `setTimeout(0)`, while `pause`/`resume` fire their invokes
        // synchronously. Calling them back-to-back races on the Tauri
        // command queue: pause/resume can arrive at the engine before
        // the seek does, leaving the engine paused at the *old*
        // position with the seek queued behind it — when the user
        // hits play later the engine resumes from the pre-Catch-Up
        // spot and the waveform jumps back. Defer the play-state
        // mirror by one short tick so the seek lands first.
        player.seek(fraction);
        if (hostPlaying !== player.isPlaying) {
          window.setTimeout(() => {
            const p = usePlayerStore.getState();
            if (!hasOrbitTrack()) return;
            if (hostPlaying && !p.isPlaying) p.resume();
            else if (!hostPlaying && p.isPlaying) p.pause();
          }, 200);
        }
      } else {
        // Different track: play + seek once the engine reports the track
        // loaded. The previous 400 ms blind delay was too short for an
        // HTTP-streamed cold-start on a transcontinental link, so the seek
        // would silently no-op and playback started at 0:00 — making Catch
        // Up effectively useless on the very latency where it matters most.
        // Mirrors the poll-until-ready pattern used by `syncToHost`.
        player.playTrack(track, [track]);
        const deadline = Date.now() + 4000;
        const poll = () => {
          const p = usePlayerStore.getState();
          if (!hasOrbitTrack()) return; // user changed tracks
          if (p.isPlaying || Date.now() >= deadline) {
            p.seek(fraction);
            if (!hostPlaying && p.isPlaying) p.pause();
            return;
          }
          window.setTimeout(poll, 100);
        };
        window.setTimeout(poll, 100);
      }
    } catch {
      // silent — if the track is gone from the host's library, nothing we can do.
    }
  };

  return {
    state,
    role,
    phase,
    sessionVisible,
    /** Host plus guests. */
    participantCount: state ? state.participants.length + 1 : 0,
    /** Milliseconds to the next automatic reshuffle; null without a session. */
    untilShuffleMs,
    /** False when the host turned automatic reshuffle off. */
    autoShuffleOn,
    showCatchUp,
    catchUp,
    exitNeedsConfirm,
    performExit,
  };
}
