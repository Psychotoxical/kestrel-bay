import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import { APP_MAIN_SCROLL_VIEWPORT_ID } from '@/constants/appScroll';
import { restoreMainViewportScroll } from '@/lib/navigation/restoreMainViewportScroll';

/** History entries whose page scroll is remembered; older ones are dropped first. */
const MAX_ENTRIES = 50;

const scrollByEntry = new Map<string, number>();

function remember(key: string, scrollTop: number) {
  scrollByEntry.delete(key);
  scrollByEntry.set(key, scrollTop);
  if (scrollByEntry.size > MAX_ENTRIES) {
    const oldest = scrollByEntry.keys().next().value;
    if (oldest !== undefined) scrollByEntry.delete(oldest);
  }
}

/**
 * Going back returns to where the page was scrolled, as in a native navigation stack: open
 * an album from an artist's album list, swipe back, and the list is still in view. Each
 * history entry keeps the page scroller's last offset; a back / forward step restores it
 * once the page has grown tall enough (its content may still be loading).
 */
export function useMobileScrollMemory(): void {
  const location = useLocation();
  const navigationType = useNavigationType();
  const currentKey = useRef(location.key);

  useEffect(() => {
    // Captured at the document: the route scroller is replaced when a page switches
    // between the plain and the in-page layout, so a listener on the element would go stale.
    const onScroll = (event: Event) => {
      const el = event.target;
      if (el instanceof HTMLElement && el.id === APP_MAIN_SCROLL_VIEWPORT_ID) {
        remember(currentKey.current, el.scrollTop);
      }
    };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => document.removeEventListener('scroll', onScroll, { capture: true });
  }, []);

  useEffect(() => {
    currentKey.current = location.key;
    if (navigationType !== 'POP') return;
    const saved = scrollByEntry.get(location.key) ?? 0;
    if (saved <= 0) return;
    let cancel: (() => void) | null = null;
    // After the app shell's own scroll reset for the new route, which runs in this commit.
    const frame = requestAnimationFrame(() => {
      cancel = restoreMainViewportScroll(saved, () => {});
    });
    return () => {
      cancelAnimationFrame(frame);
      cancel?.();
    };
  }, [location.key, navigationType]);
}

export function _resetMobileScrollMemoryForTest(): void {
  scrollByEntry.clear();
}
