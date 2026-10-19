/**
 * iOS moves an app's data container on every update (a new UUID in
 * `/var/mobile/Containers/Data/Application/<UUID>/…`), and the files move with it. The
 * local playback index stores absolute paths, so after an update every entry pointed at the
 * old container: the startup check found no bytes and dropped the hot cache and downloads.
 *
 * The touch shell rebases those paths onto the current media root before anything checks
 * them; the check waits for that through `localPathRebaseReady`.
 */

let ready: Promise<void> = Promise.resolve();

/** Resolves once the stored local paths point at the current container (at once elsewhere). */
export function localPathRebaseReady(): Promise<void> {
  return ready;
}

/** Registers the running rebase so the cache checks wait for it. */
export function setLocalPathRebase(task: Promise<void>): void {
  ready = task.catch(() => {});
}

/**
 * The path re-rooted onto `mediaRoot`, or null when it already lives there or does not
 * belong to an app container's media directory. The part of `mediaRoot` from `/Library/`
 * on (e.g. `/Library/Application Support/dev.psysonic.player/media`) is the same in every
 * container; what comes before it is what an update changes.
 */
export function rebasedLocalPath(path: string, mediaRoot: string): string | null {
  const libraryAt = mediaRoot.indexOf('/Library/');
  if (libraryAt < 0) return null;
  const tail = mediaRoot.slice(libraryAt);
  const at = path.indexOf(`${tail}/`);
  if (at <= 0) return null;
  const next = mediaRoot + path.slice(at + tail.length);
  return next === path ? null : next;
}
