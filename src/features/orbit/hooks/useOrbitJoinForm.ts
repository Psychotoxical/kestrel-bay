import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import {
  parseOrbitShareLink,
  findSessionPlaylistId,
  readOrbitState,
  joinOrbitSession,
  orbitJoinErrorKey,
} from '@/features/orbit/utils/orbit';
import { switchActiveServer } from '@/utils/server/switchActiveServer';
import { normalizeServerBaseUrl, profileServesShareBase } from '@/lib/server/serverEndpoint';
import { useOrbitAccountPickerStore } from '@/features/orbit/store/orbitAccountPickerStore';
import { showToast } from '@/lib/dom/toast';

/**
 * State and actions of the manual join form, shared by the desktop modal
 * (`OrbitJoinModal`) and the touch shell's sheet. Reuses the same parse +
 * preflight pipeline the clipboard handler uses. A failed join shows the
 * translated reason.
 */
export function useOrbitJoinForm(onClose: () => void) {
  const { t } = useTranslation();
  const [link, setLinkState] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLink = (next: string) => { setLinkState(next); setError(null); };

  const onPaste = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) setLinkState(clip);
    } catch { /* silent — clipboard perms vary */ }
  };

  const onJoin = async () => {
    setError(null);
    const text = link.trim();
    if (!text) { setError(t('orbit.joinErrEmpty')); return; }
    const parsed = parseOrbitShareLink(text);
    if (!parsed) { setError(t('orbit.joinErrInvalid')); return; }

    const active = useAuthStore.getState().getActiveServer();
    const wantUrl = normalizeServerBaseUrl(parsed.serverBase);

    setBusy(true);
    try {
      let targetServerId = active?.id ?? '';
      // Auto-switch to the link's server if the user has an account for it.
      // Multiple candidates → picker modal. Any existing Orbit binding remains
      // pinned to its original server until its own lifecycle ends.
      if (!(active && profileServesShareBase(active, wantUrl))) {
        const candidates = useAuthStore.getState().servers
          .filter(s => profileServesShareBase(s, wantUrl));
        if (candidates.length === 0) {
          setError(t('orbit.toastNoAccountForServer', { url: wantUrl }));
          return;
        }
        const target = candidates.length === 1
          ? candidates[0]
          : await useOrbitAccountPickerStore.getState().request(candidates);
        if (!target) { setBusy(false); return; }
        const switched = await switchActiveServer(target);
        if (!switched) {
          setError(t('orbit.toastSwitchFailed', { url: wantUrl }));
          return;
        }
        targetServerId = target.id;
      }

      if (!targetServerId) { setError(t('orbit.joinErrNoUser')); return; }

      const playlistId = await findSessionPlaylistId(parsed.sid, targetServerId);
      if (!playlistId) { setError(t('orbit.joinErrNotFound')); return; }
      const state = await readOrbitState(playlistId, targetServerId);
      if (!state)      { setError(t('orbit.joinErrNotFound')); return; }
      if (state.ended) { setError(t('orbit.joinErrEnded')); return; }
      await joinOrbitSession(parsed.sid, targetServerId);
      showToast(t('orbit.toastJoined'), 2200, 'info');
      onClose();
    } catch (e) {
      setError(t(orbitJoinErrorKey(e)));
    } finally {
      setBusy(false);
    }
  };

  return { link, setLink, onPaste, busy, error, onJoin };
}
