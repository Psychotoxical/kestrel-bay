import { appDataDir, join } from '@tauri-apps/api/path';
import { getMediaDir } from '@/lib/media/mediaDir';
import { rebasedLocalPath, setLocalPathRebase } from '@/lib/cache/localPathRebase';
import { useLocalPlaybackStore, type LocalPlaybackEntry } from '@/store/localPlaybackStore';

/**
 * Points every stored local playback path (hot cache and downloads) at the current app
 * container, which iOS replaces on each update. Only for the default media folder; a
 * user-chosen one does not move. Returns how many entries changed.
 */
export async function rebaseLocalPlaybackPaths(): Promise<number> {
  if (getMediaDir()) return 0;
  const mediaRoot = await join(await appDataDir(), 'media');
  const { entries } = useLocalPlaybackStore.getState();
  let changed = 0;
  const next: Record<string, LocalPlaybackEntry> = {};
  for (const [key, entry] of Object.entries(entries)) {
    const path = rebasedLocalPath(entry.localPath, mediaRoot);
    if (path) changed += 1;
    next[key] = path ? { ...entry, localPath: path } : entry;
  }
  if (changed > 0) useLocalPlaybackStore.setState({ entries: next });
  return changed;
}

/** Starts the rebase once at app start; the cache checks wait for it. */
export function startLocalPlaybackPathRebase(): void {
  setLocalPathRebase(rebaseLocalPlaybackPaths().then(() => undefined));
}
