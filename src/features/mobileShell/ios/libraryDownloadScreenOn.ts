import { emit } from '@tauri-apps/api/event';
import { watchLibraryDownloadActivity } from '@/features/mobileShell/utils/libraryDownloadActivity';

/**
 * iPhone: a whole-library download only runs while Psysonic is open, so the screen stays
 * on while one runs (`src-tauri/src/ios/screen.rs`); the auto-lock would suspend the app.
 * Returns the cleanup.
 */
export function keepScreenOnForLibraryDownloads(): () => void {
  return watchLibraryDownloadActivity(active => {
    void emit('ios:keep-screen-on', active).catch(() => {});
  });
}
