import { save, type SaveDialogOptions } from '@tauri-apps/plugin-dialog';
import { documentDir, join } from '@tauri-apps/api/path';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

type ExportDialogOptions = SaveDialogOptions & { defaultPath: string };

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * Where an export gets written. Desktop: the place the user picks in the save
 * dialog (`null` when cancelled), as before.
 *
 * Touch shell (iOS): iOS has no "save as". Its picker only exports a file that
 * already exists, and the place it returns lies outside the app's sandbox,
 * where the app cannot write. So the export goes into the app's own Documents
 * folder (the "Psysonic" folder in the Files app); `offerExportFile` then hands
 * it to the picker.
 */
export async function pickExportPath(options: ExportDialogOptions): Promise<string | null> {
  if (IS_MOBILE_SHELL) return join(await documentDir(), fileNameOf(options.defaultPath));
  const selected = await save(options);
  return selected && !Array.isArray(selected) ? selected : null;
}

/**
 * Touch shell (iOS): once the export is written, lets the user copy it from the
 * Psysonic folder anywhere in the Files app. Cancelling keeps it in the
 * Psysonic folder. Nothing to do on the desktop, where it is already in place.
 */
export async function offerExportFile(path: string): Promise<void> {
  if (!IS_MOBILE_SHELL) return;
  await save({ defaultPath: fileNameOf(path) }).catch(() => {});
}
