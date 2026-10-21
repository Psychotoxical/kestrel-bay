import { save, type SaveDialogOptions } from '@tauri-apps/plugin-dialog';
import { appCacheDir, documentDir, join } from '@tauri-apps/api/path';
import { IS_ANDROID, IS_MOBILE_SHELL } from '@/lib/util/platform';

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
 * Touch shell: once the export is written, lets the user put a copy anywhere.
 * iOS: the Files picker copies the file from the Psysonic folder itself;
 * cancelling keeps it there. Android: the picker only creates an empty document
 * at the chosen place and returns its `content://` address, so the export is
 * copied into it. Nothing to do on the desktop, where it is already in place.
 */
export async function offerExportFile(path: string): Promise<void> {
  if (!IS_MOBILE_SHELL) return;
  const target = await save({ defaultPath: fileNameOf(path) }).catch(() => null);
  if (IS_ANDROID && target) await androidCopy(files => files.copyOut, path, target);
}

/** Android's native copy between a `content://` document and a file (`PsysonicFiles.kt`). */
interface AndroidFiles {
  /** Copies into `dir`, named after the document; the answer carries the new path. */
  copyIn(id: number, uri: string, dir: string): void;
  copyOut(id: number, path: string, uri: string): void;
}

declare global {
  interface Window {
    PsysonicAndroidFiles?: AndroidFiles;
    __psyFileCopied?: (id: number, error: string | null, path: string | null) => void;
  }
}

let nextCopyId = 1;
const pendingCopies = new Map<number, { resolve: (path: string) => void; reject: (error: Error) => void }>();

/**
 * Streams a file natively. Backups can be large: as bytes through the web view they
 * ran the app out of memory.
 */
function androidCopy(
  pick: (files: AndroidFiles) => (id: number, a: string, b: string) => void,
  from: string,
  to: string,
): Promise<string> {
  const files = window.PsysonicAndroidFiles;
  if (!files) return Promise.reject(new Error('android file bridge missing'));
  window.__psyFileCopied ??= (id, error, path) => {
    const pending = pendingCopies.get(id);
    pendingCopies.delete(id);
    if (error === null) pending?.resolve(path ?? '');
    else pending?.reject(new Error(error));
  };
  const id = nextCopyId++;
  return new Promise((resolve, reject) => {
    pendingCopies.set(id, { resolve, reject });
    pick(files).call(files, id, from, to);
  });
}

/**
 * A picked file as a path the app's own code can open. Android's picker hands out
 * `content://` addresses, which the Rust side cannot read as files: the file is
 * copied into the app's cache first, under the document's own name (backup kinds are
 * told apart by their extension). Any other path is returned as it is.
 */
export async function localCopyOfPicked(picked: string): Promise<string> {
  if (!IS_ANDROID || !picked.startsWith('content://')) return picked;
  return androidCopy(files => files.copyIn, picked, await appCacheDir());
}
