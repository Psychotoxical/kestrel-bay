import { useMemo } from 'react';
import { useAuthStore } from '@/store/authStore';
import type { MusicFolder, ServerProfile } from '@/store/authStoreTypes';
import { deriveEffectiveLibraryBrowseServerIds } from '@/lib/library/libraryBrowseScope';
import { serverListDisplayLabel } from '@/lib/server/serverDisplayName';
import { useUnavailableServerIds } from '@/lib/network/serverReachability';
import { useOfflineBrowseContext } from '@/features/offline';

export interface MobileLibraryGroup {
  serverId: string;
  serverLabel: string;
  folders: MusicFolder[];
  /** Empty = all libraries of that server. */
  selectedLibraryIds: string[];
}

export interface MobileSourceScope {
  servers: ServerProfile[];
  activeServerId: string | null;
  /** Servers the user picked for browsing. */
  selectedServerIds: string[];
  /** Picked servers that are reachable right now. */
  effectiveServerIds: string[];
  unavailableServerIds: ReadonlySet<string>;
  libraryGroups: MobileLibraryGroup[];
  /** More than one saved server: the server list is worth showing. */
  multiServer: boolean;
  /** Browsing more than one server at once. */
  multiScope: boolean;
  /** Some picked servers are unreachable. */
  unavailableSelection: boolean;
  /** Something to choose among the libraries (and not in offline mode). */
  showLibraries: boolean;
  /** A library filter narrows at least one server. */
  hasLibrarySelection: boolean;
}

const EMPTY_LIBRARY_IDS: string[] = [];

/**
 * Touch shell: the servers and libraries the app browses — the scope the desktop
 * edits in the connection menu (servers) and the sidebar library picker, derived
 * the same way.
 */
export function useMobileSourceScope(): MobileSourceScope {
  const servers = useAuthStore(s => s.servers);
  const activeServerId = useAuthStore(s => s.activeServerId);
  const selectedServerIds = useAuthStore(s => s.libraryBrowseServerIds);
  const musicFolders = useAuthStore(s => s.musicFolders);
  const musicFoldersByServer = useAuthStore(s => s.musicFoldersByServer);
  const selectionByServer = useAuthStore(s => s.libraryBrowseSelectionByServer);
  const unavailableServerIds = useUnavailableServerIds();
  const offline = useOfflineBrowseContext().active;

  const effectiveServerIds = useMemo(() => deriveEffectiveLibraryBrowseServerIds({
    servers,
    activeServerId,
    libraryBrowseServerIds: selectedServerIds,
  }, unavailableServerIds), [activeServerId, selectedServerIds, servers, unavailableServerIds]);

  const libraryGroups = useMemo(() => {
    const picked = new Set(effectiveServerIds);
    return servers
      .filter(server => picked.has(server.id))
      .map(server => ({
        serverId: server.id,
        serverLabel: serverListDisplayLabel(server, servers),
        folders: musicFoldersByServer[server.id]
          ?? (server.id === activeServerId ? musicFolders : []),
        selectedLibraryIds: selectionByServer[server.id] ?? EMPTY_LIBRARY_IDS,
      }));
  }, [activeServerId, effectiveServerIds, musicFolders, musicFoldersByServer, selectionByServer, servers]);

  const folderCount = libraryGroups.reduce((count, group) => count + group.folders.length, 0);
  const multiScope = selectedServerIds.length > 1;

  return {
    servers,
    activeServerId,
    selectedServerIds,
    effectiveServerIds,
    unavailableServerIds,
    libraryGroups,
    multiServer: servers.length > 1,
    multiScope,
    unavailableSelection: multiScope && effectiveServerIds.length < selectedServerIds.length,
    showLibraries: !offline && (libraryGroups.length > 1 || folderCount > 1),
    hasLibrarySelection: libraryGroups.some(group => group.selectedLibraryIds.length > 0),
  };
}
