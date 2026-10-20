/**
 * ⚠️ Android territory. The back key closes the topmost sheet, menu or overlay first, as
 * it does in every Android app; only with none open does it go back a page (wry) or send
 * the app to the background (`src-tauri/android/MainActivity.kt`). Every overlay already
 * closes on Escape, so the back key becomes an Escape on the topmost one.
 */
import { IS_ANDROID } from '@/lib/util/platform';

/** Overlays that close on Escape: sheets, the context menu, the "…" menu, search, theme preview. */
export const OVERLAY_SELECTOR =
  '.mobile-sheet, .context-menu, .mobile-more-menu__list, .mobile-search-overlay, .mobile-theme-preview';

declare global {
  interface Window {
    __psyAndroidBack?: () => void;
  }
}

/** The overlay opened last (portals append to the end of the body). */
export function topOverlay(root: ParentNode = document): Element | null {
  const all = root.querySelectorAll(OVERLAY_SELECTOR);
  return all.length > 0 ? all[all.length - 1] : null;
}

/** Sends Escape to the topmost overlay (to its focused field, if any); false when none is open. */
export function closeTopOverlay(): boolean {
  const top = topOverlay();
  if (!top) return false;
  const active = document.activeElement;
  const target = active && top.contains(active) ? active : top;
  target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  return true;
}

/** Tells the activity whether an overlay is open, so it hands it the back key; returns the cleanup. */
export function installAndroidBack(): () => void {
  if (!IS_ANDROID) return () => {};
  let open = false;
  let queued = false;
  const report = () => {
    queued = false;
    const now = topOverlay() !== null;
    if (now === open) return;
    open = now;
    window.PsysonicAndroidShell?.setOverlayOpen?.(now);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(report);
  };
  window.__psyAndroidBack = () => { closeTopOverlay(); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  report();
  return () => {
    observer.disconnect();
    delete window.__psyAndroidBack;
    if (open) window.PsysonicAndroidShell?.setOverlayOpen?.(false);
  };
}
