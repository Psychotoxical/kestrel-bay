import i18n from '@/lib/i18n';
import { isMeteredNetwork } from '@/lib/network/meteredNetwork';
import { allowMeteredDownload, disallowMeteredDownload } from '@/features/offline';
import { useMobileActionSheetStore } from '@/features/mobileShell/store/mobileActionSheetStore';

/**
 * Starts a download (`key`: see `meteredPinKey` / `meteredGroupKey`). On mobile
 * data it first asks: load over mobile data now, or wait for Wi-Fi. Waiting
 * still queues the download; it starts by itself once Wi-Fi is there.
 */
export async function startTouchDownload(key: string, start: () => void | Promise<void>): Promise<void> {
  if (isMeteredNetwork()) {
    const choice = await useMobileActionSheetStore.getState().request({
      title: i18n.t('connection.meteredPromptTitle'),
      message: i18n.t('connection.meteredPromptMessage'),
      actions: [
        { id: 'cellular', label: i18n.t('connection.meteredDownloadNow'), primary: true },
        { id: 'wait', label: i18n.t('connection.meteredWaitForWifi') },
      ],
    });
    if (choice === 'cellular') allowMeteredDownload(key);
    else if (choice === 'wait') disallowMeteredDownload(key);
    else return;
  }
  await start();
}

/**
 * A download waits for Wi-Fi: load it over mobile data now, or cancel it (when
 * `cancel` is given). Closing the sheet keeps it waiting.
 */
export async function resolveHeldDownload(key: string, cancel?: () => void | Promise<void>): Promise<void> {
  const choice = await useMobileActionSheetStore.getState().request({
    title: i18n.t('connection.downloadWaitingForWifi'),
    message: i18n.t('connection.heldPromptMessage'),
    actions: [
      { id: 'cellular', label: i18n.t('connection.heldDownloadNow'), primary: true },
      ...(cancel ? [{ id: 'stop', label: i18n.t('connection.heldCancelDownload'), danger: true }] : []),
    ],
  });
  if (choice === 'cellular') allowMeteredDownload(key);
  else if (choice === 'stop') await cancel?.();
}
