import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  startOrbitSession,
  buildOrbitShareLink,
  generateSessionId,
} from '@/features/orbit/utils/orbit';
import { randomOrbitSessionName } from '@/features/orbit/utils/orbitNames';
import { useAuthStore } from '@/store/authStore';
import { isLanUrl, serverShareBaseUrl } from '@/lib/server/serverEndpoint';
import { serverListDisplayLabel } from '@/lib/server/serverDisplayName';
import { ORBIT_DEFAULT_MAX_USERS } from '@/features/orbit/api/orbit';
import { useUnavailableServerIds } from '@/lib/network/serverReachability';

/**
 * State and actions of the start-session form, shared by the desktop modal
 * (`OrbitStartModal`) and the touch shell's sheet.
 *
 * A share-link is available immediately (built from a pre-generated session
 * id + the server's share address). The host can copy it any time; starting
 * creates the session under that same id and auto-copies the link if it
 * hasn't been copied yet.
 */
export function useOrbitStartForm(onClose: () => void) {
  const { t } = useTranslation();
  const [sid]                     = useState(() => generateSessionId());
  const [name, setNameState]      = useState(() => randomOrbitSessionName());
  const [maxUsers, setMaxUsers]   = useState(ORBIT_DEFAULT_MAX_USERS);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [copied, setCopied]       = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [clearQueue, setClearQueue] = useState(false);

  const servers = useAuthStore(state => state.servers);
  const libraryBrowseServerIds = useAuthStore(state => state.libraryBrowseServerIds);
  const unavailableServerIds = useUnavailableServerIds();
  const [serverId, setServerId] = useState(() => {
    const auth = useAuthStore.getState();
    return auth.libraryBrowseServerIds.includes(auth.activeServerId ?? '')
      ? auth.activeServerId ?? ''
      : auth.libraryBrowseServerIds[0] ?? auth.activeServerId ?? '';
  });
  const serverOptions = servers
    .filter(server => libraryBrowseServerIds.includes(server.id))
    .map(server => {
      const label = serverListDisplayLabel(server, servers);
      return {
        id: server.id,
        label,
        warning: unavailableServerIds.has(server.id)
          ? t('connection.offlineSubtitle', { server: label })
          : undefined,
      };
    });
  const server = servers.find(candidate => candidate.id === serverId);
  // Orbit links go to remote guests — use the share URL (public by default
  // when both are set; LAN only if shareUsesLocalUrl is on). The LAN warning
  // then correctly reads the address the guest will actually see.
  const serverBase = server ? serverShareBaseUrl(server) : '';
  const serverName = server?.name ?? server?.url ?? t('orbit.fallbackServer');
  const onLan      = isLanUrl(serverBase);

  const shareLink = buildOrbitShareLink(serverBase, sid);

  const writeLinkToClipboard = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(shareLink);
      return true;
    } catch {
      return false;
    }
  };

  const onCopy = async () => {
    const ok = await writeLinkToClipboard();
    if (ok) {
      setCopied(true);
      setHasCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  };

  /** `copyLink: false` skips the auto-copy (the touch shell shares from the session room instead). */
  const onStart = async ({ copyLink = true }: { copyLink?: boolean } = {}) => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) { setError(t('orbit.errNameRequired')); return; }
    if (!server) { setError(t('orbit.joinErrNoUser')); return; }

    if (copyLink && !hasCopied) {
      const ok = await writeLinkToClipboard();
      if (ok) setHasCopied(true);
    }

    setBusy(true);
    try {
      await startOrbitSession({ name: trimmed, maxUsers, sid, serverId: server.id, clearQueue });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('orbit.errStartFailed'));
    } finally {
      setBusy(false);
    }
  };

  /** A new name means a new link to share. */
  const setName = (next: string) => { setNameState(next); setHasCopied(false); };
  const reshuffleName = () => setName(randomOrbitSessionName());
  const selectServer = (nextServerId: string) => {
    setServerId(nextServerId);
    setHasCopied(false);
    setError(null);
  };

  return {
    name, setName, reshuffleName,
    maxUsers, setMaxUsers,
    clearQueue, setClearQueue,
    serverId, serverOptions, selectServer, server, serverName, onLan,
    shareLink, copied, hasCopied, onCopy,
    busy, error, onStart,
  };
}
