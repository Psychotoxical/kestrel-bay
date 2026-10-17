import { useTranslation } from 'react-i18next';
import { HardDriveDownload, Loader2, Trash2 } from 'lucide-react';
import { albumArtistDisplayName, useAlbumOfflineState } from '@/features/album';
import {
  dequeueOfflinePin, meteredPinKey, resolveAlbum, resolveMediaServerId, useDownloadKeyHeldForWifi, useOfflineStore,
} from '@/features/offline';
import { resolveHeldDownload, startTouchDownload } from '@/features/mobileShell';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';
import { useConfirmModalStore } from '@/store/confirmModalStore';
import type { ContextMenuItemsProps } from '@/features/contextMenu/components/contextMenuItemTypes';

interface Props {
  album: SubsonicAlbum;
  handleAction: ContextMenuItemsProps['handleAction'];
  /** Online: a download can start. A finished one stays removable offline. */
  canPinOffline: boolean;
}

/**
 * Touch shell: the album menu's download row, in place of the ZIP download —
 * a phone has no folder to save a ZIP to. Same states and the same mobile-data
 * question as the album page's download toggle.
 */
export default function TouchAlbumDownloadItem({ album, handleAction, canPinOffline }: Props) {
  const { t } = useTranslation();
  const serverId = resolveMediaServerId(album.serverId) ?? '';
  const { resolvedOfflineStatus: status, offlineProgress } = useAlbumOfflineState(album.id, serverId);
  const downloadKey = meteredPinKey(album.id, serverId);
  const heldForWifi = useDownloadKeyHeldForWifi(downloadKey, status === 'queued' || status === 'downloading');
  if (!serverId) return null;
  if (status === 'none' && !canPinOffline) return null;
  const remove = () => useOfflineStore.getState().deleteAlbum(album.id, serverId, { kind: 'album', sourceId: album.id });

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
      <div className="context-menu-item" onClick={() => handleAction(() => { dequeueOfflinePin(album.id, serverId); })}>
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
            message: t('connection.removeDownloadMessage', { name: album.name }),
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
        const albumData = await resolveAlbum(serverId, album.id);
        // Silent on a failed resolve, as "Play Next" in the same menu.
        if (!albumData || albumData.songs.length === 0) return;
        await useOfflineStore.getState().downloadAlbum(
          album.id,
          album.name,
          albumArtistDisplayName(album),
          album.coverArt,
          album.year,
          albumData.songs,
          serverId,
        );
      }))}
    >
      <HardDriveDownload size={14} /> {t('connection.download')}
    </div>
  );
}
