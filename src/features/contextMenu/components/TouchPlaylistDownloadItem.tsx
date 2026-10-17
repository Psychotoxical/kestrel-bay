import { useTranslation } from 'react-i18next';
import { HardDriveDownload, Loader2, Trash2 } from 'lucide-react';
import { useAlbumOfflineState } from '@/features/album';
import {
  dequeueOfflinePin, meteredPinKey, resolveMediaServerId, resolvePlaylist, useDownloadKeyHeldForWifi, useOfflineStore,
} from '@/features/offline';
import { playlistDetailControls } from '@/features/playlist';
import { resolveHeldDownload, startTouchDownload } from '@/features/mobileShell';
import { filterSongsToServerLibrary } from '@/lib/api/subsonicLibrary';
import { playlistDisplayName } from '@/lib/format/playlistClassification';
import type { SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import { useConfirmModalStore } from '@/store/confirmModalStore';
import type { ContextMenuItemsProps } from '@/features/contextMenu/components/contextMenuItemTypes';

interface Props {
  playlist: SubsonicPlaylist;
  handleAction: ContextMenuItemsProps['handleAction'];
  /** Online: a download can start. A finished one stays removable offline. */
  canPinOffline: boolean;
}

/**
 * Touch shell: the playlist menu's download row. Same states and the same
 * mobile-data question as the playlist page's download toggle; smart playlists
 * are not saved, as there.
 */
export default function TouchPlaylistDownloadItem({ playlist, handleAction, canPinOffline }: Props) {
  const { t } = useTranslation();
  const serverId = resolveMediaServerId(playlist.serverId) ?? '';
  const { resolvedOfflineStatus: status, offlineProgress } = useAlbumOfflineState(
    playlist.id, serverId, undefined, 'playlist',
  );
  const downloadKey = meteredPinKey(playlist.id, serverId);
  const heldForWifi = useDownloadKeyHeldForWifi(downloadKey, status === 'queued' || status === 'downloading');
  if (!serverId) return null;
  if (status === 'none' && (!canPinOffline || !playlistDetailControls(playlist).canPinNewOfflineCache)) return null;
  const remove = () => useOfflineStore.getState().deleteAlbum(playlist.id, serverId, { kind: 'playlist', sourceId: playlist.id });

  if (heldForWifi) {
    return (
      <div className="context-menu-item" onClick={() => handleAction(() => resolveHeldDownload(downloadKey, remove))}>
        <HardDriveDownload size={14} /> {t('connection.downloadWaitingForWifi')}
      </div>
    );
  }
  if (status === 'downloading') {
    return (
      <div className="context-menu-item is-disabled" aria-disabled>
        <Loader2 size={14} className="spin" />
        {t('connection.downloadProgress', { done: offlineProgress?.done ?? 0, total: offlineProgress?.total ?? 0 })}
      </div>
    );
  }
  if (status === 'queued') {
    return (
      <div className="context-menu-item" onClick={() => handleAction(() => { dequeueOfflinePin(playlist.id, serverId); })}>
        <HardDriveDownload size={14} /> {t('albumDetail.removeFromOfflineQueue')}
      </div>
    );
  }
  if (status === 'cached') {
    return (
      <div
        className="context-menu-item"
        style={{ color: 'var(--danger)' }}
        onClick={() => handleAction(async () => {
          const confirmed = await useConfirmModalStore.getState().request({
            title: t('connection.removeDownloadTitle'),
            message: t('connection.removeDownloadMessage', { name: playlistDisplayName(playlist) }),
            confirmLabel: t('connection.removeDownload'),
            cancelLabel: t('common.cancel'),
            danger: true,
          });
          if (!confirmed) return;
          await remove();
        })}
      >
        <Trash2 size={14} /> {t('connection.removeDownload')}
      </div>
    );
  }
  return (
    <div
      className="context-menu-item"
      onClick={() => handleAction(() => startTouchDownload(downloadKey, async () => {
        const data = await resolvePlaylist(serverId, playlist.id);
        if (!data) return;
        // Scoped to the active library, as the playlist page and "Play" are (#1241).
        const songs = await filterSongsToServerLibrary(data.songs, serverId).catch(() => data.songs);
        if (songs.length === 0) return;
        await useOfflineStore.getState().downloadPlaylist(
          playlist.id, playlist.name, playlist.coverArt, songs, serverId, playlist.smart,
        );
      }))}
    >
      <HardDriveDownload size={14} /> {t('connection.download')}
    </div>
  );
}
