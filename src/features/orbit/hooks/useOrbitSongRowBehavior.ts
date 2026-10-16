import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrbitStore } from '@/features/orbit/store/orbitStore';
import {
  suggestOrbitTrack,
  hostEnqueueToOrbit,
  evaluateOrbitSuggestGate,
  OrbitSuggestBlockedError,
} from '@/features/orbit/utils/orbit';
import { showToast } from '@/lib/dom/toast';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';
import { useThemeStore } from '@/store/themeStore';

/** Touch shell: a quick double tap can also fire click + click + dblclick; one add is enough. */
const TOUCH_REPEAT_ADD_MS = 1000;

/**
 * Shared behaviour for song rows that in "normal mode" swallow a full list
 * into the queue on single-click (AlbumDetail, PlaylistDetail, Favorites,
 * ArtistDetail top-songs, SearchBrowsePage, RandomMix).
 *
 * In an active Orbit session this is too destructive — the list would
 * propagate to every guest's player. Instead:
 *
 *   - `queueHint()`   — show a toast telling the user to double-click.
 *                       Safe to call on every single-click; 220 ms debounce
 *                       suppresses the pileup that browsers emit before a
 *                       dblclick fires.
 *   - `addTrackToOrbit(songId, serverId)` — cancel any pending hint and add just that
 *                       one track: suggestOrbitTrack for guests,
 *                       hostEnqueueToOrbit for the host.
 *   - `orbitRowClick(songId, serverId)` — what a single click / tap on a row
 *                       does in a session: the hint on the desktop (the
 *                       double click adds); in the touch shell, which has no
 *                       double tap, the tap itself adds that one track.
 *
 * `orbitActive` is the gate — when false, callers should skip the hint and
 * run their original bulk-play path unchanged.
 *
 * `doubleClickToPlay` is the user's Settings → Input choice. Outside Orbit it
 * moves the row's play from a single click to a double click; the row's play
 * button is unaffected. Orbit keeps precedence over it.
 */
export function useOrbitSongRowBehavior() {
  const { t } = useTranslation();
  const orbitRole = useOrbitStore(s => s.role);
  const orbitActive = orbitRole === 'host' || orbitRole === 'guest';
  const doubleClickToPlay = useThemeStore(s => s.trackRowPlayClick === 'double');
  const clickTimerRef = useRef<number | null>(null);
  const lastTouchAddRef = useRef<{ songId: string; at: number } | null>(null);

  const queueHint = useCallback(() => {
    if (clickTimerRef.current !== null) return;
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      showToast(t('albumDetail.orbitDoubleClickHint'), 2400, 'info');
    }, 220);
  }, [t]);

  const addTrackToOrbit = useCallback((songId: string, serverId?: string) => {
    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    if (IS_MOBILE_SHELL) {
      const now = Date.now();
      const last = lastTouchAddRef.current;
      if (last && last.songId === songId && now - last.at < TOUCH_REPEAT_ADD_MS) return;
      lastTouchAddRef.current = { songId, at: now };
    }
    if (orbitRole === 'guest') {
      const gate = evaluateOrbitSuggestGate();
      if (!gate.allowed && gate.reason === 'muted') {
        showToast(t('orbit.suggestBlockedMuted'), 3500, 'error');
        return;
      }
      suggestOrbitTrack(songId, serverId)
        .then(() => showToast(t('orbit.ctxSuggestedToast'), 2200, 'info'))
        .catch(err => {
          if (err instanceof OrbitSuggestBlockedError && err.reason === 'muted') {
            showToast(t('orbit.suggestBlockedMuted'), 3500, 'error');
          } else {
            showToast(t('orbit.ctxSuggestFailed'), 3000, 'error');
          }
        });
    } else if (orbitRole === 'host') {
      hostEnqueueToOrbit(songId, serverId)
        .then(() => showToast(t('orbit.ctxAddedHostToast'), 2200, 'info'))
        .catch(() => showToast(t('orbit.ctxAddHostFailed'), 3000, 'error'));
    }
  }, [orbitRole, t]);

  const orbitRowClick = useCallback((songId: string, serverId?: string) => {
    if (IS_MOBILE_SHELL) addTrackToOrbit(songId, serverId);
    else queueHint();
  }, [addTrackToOrbit, queueHint]);

  return { orbitActive, doubleClickToPlay, queueHint, addTrackToOrbit, orbitRowClick };
}
