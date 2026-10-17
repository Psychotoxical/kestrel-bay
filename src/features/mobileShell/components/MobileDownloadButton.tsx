import { useTranslation } from 'react-i18next';
import { Check, HardDriveDownload } from 'lucide-react';
import { useConfirmModalStore } from '@/store/confirmModalStore';
import { useDownloadKeyHeldForWifi } from '@/features/offline';
import { resolveHeldDownload, startTouchDownload } from '@/features/mobileShell/utils/meteredDownload';

export type MobileDownloadStatus = 'none' | 'queued' | 'downloading' | 'cached';

interface Props {
  status: MobileDownloadStatus;
  progress: { done: number; total: number } | null;
  /** Album or playlist name, for the remove confirmation. */
  name: string;
  /** The download's pin key (`meteredPinKey`), for the mobile-data question. */
  downloadKey: string;
  /** Starts the download, or takes a queued one back out of the queue. */
  onDownload: () => void;
  /** Deletes the downloaded files and stops a running download. */
  onRemove: () => void;
}

const RING_RADIUS = 9;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Download toggle of the album and playlist pages: the desktop's offline icon,
 * a ring while it loads, a tick once it is on the device. The tick asks before
 * it removes the download; a running download cannot be stopped, as on the
 * desktop, but a queued one can. On mobile data a new download first asks
 * whether to load now or wait for Wi-Fi, and a waiting one offers both again.
 */
export default function MobileDownloadButton({
  status, progress, name, downloadKey, onDownload, onRemove,
}: Props) {
  const { t } = useTranslation();
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
  const heldForWifi = useDownloadKeyHeldForWifi(downloadKey, status === 'queued' || status === 'downloading');

  const handleClick = async () => {
    if (heldForWifi) {
      await resolveHeldDownload(downloadKey, onRemove);
      return;
    }
    if (status === 'downloading') return;
    if (status === 'none') {
      await startTouchDownload(downloadKey, onDownload);
      return;
    }
    if (status === 'queued') {
      onDownload();
      return;
    }
    const confirmed = await useConfirmModalStore.getState().request({
      title: t('connection.removeDownloadTitle'),
      message: t('connection.removeDownloadMessage', { name }),
      confirmLabel: t('connection.removeDownload'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (confirmed) onRemove();
  };

  const label = status === 'cached'
    ? t('connection.downloaded')
    : heldForWifi
      ? t('connection.downloadWaitingForWifi')
      : status === 'downloading'
        ? t('connection.downloadProgress', { done, total })
        : status === 'queued' ? t('connection.downloadQueued') : t('connection.download');
  const filled = status === 'downloading' && total > 0 ? done / total : 0;

  return (
    <button
      type="button"
      className={`mobile-round-btn mobile-download-btn${status === 'cached' ? ' is-active' : ''}`}
      data-status={heldForWifi ? 'held' : status}
      aria-label={label}
      aria-disabled={(status === 'downloading' && !heldForWifi) || undefined}
      onClick={() => { void handleClick(); }}
    >
      {status === 'cached' ? (
        <Check size={21} strokeWidth={2.4} aria-hidden="true" />
      ) : status === 'none' ? (
        <HardDriveDownload size={21} aria-hidden="true" />
      ) : (
        <svg className="mobile-download-btn__ring" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="mobile-download-btn__track" cx="12" cy="12" r={RING_RADIUS} />
          <circle
            className="mobile-download-btn__fill"
            cx="12"
            cy="12"
            r={RING_RADIUS}
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={status === 'queued' ? RING_LENGTH * 0.75 : RING_LENGTH * (1 - filled)}
          />
        </svg>
      )}
    </button>
  );
}
