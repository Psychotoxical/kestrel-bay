/**
 * ⚠️ Android territory. While a whole-library download runs, the native side keeps the web
 * view running and the app in the foreground (`PsysonicMedia.setBackgroundWork`,
 * `PsysonicDownloadService.kt`), as it does while music plays. Without that the download
 * ran at half speed with the screen off (S22, 25.10.).
 */
import i18n from '@/lib/i18n';
import { androidSetBackgroundWork } from '@/features/mobileShell/android/androidMedia';
import { watchLibraryDownloadActivity } from '@/features/mobileShell/utils/libraryDownloadActivity';

/** Returns the cleanup. */
export function keepAwakeForLibraryDownloads(): () => void {
  return watchLibraryDownloadActivity((active, libraryNames) => {
    androidSetBackgroundWork(active, i18n.t('connection.libraryDownloadNotificationTitle'), libraryNames);
  });
}
