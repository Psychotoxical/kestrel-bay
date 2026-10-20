import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router';
import { APP_MAIN_SCROLL_VIEWPORT_ID } from '@/constants/appScroll';

/** History entries whose page scroll is remembered; older ones are dropped first. */
const MAX_ENTRIES = 50;
/** How long a back step waits for the page to grow tall enough (its content may still be loading). */
const RESTORE_WAIT_MS = 4000;

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
 * Scrolls the page scroller to `target` as soon as its content is tall enough, checking every
 * frame. A touch on the page ends the wait, so the page never jumps under the finger.
 */
function restoreWhenTallEnough(target: number): () => void {
  const deadline = performance.now() + RESTORE_WAIT_MS;
  let frame = 0;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    document.removeEventListener('touchstart', stop, { capture: true });
  };
  const tick = () => {
    if (stopped) return;
    const el = document.getElementById(APP_MAIN_SCROLL_VIEWPORT_ID);
    if (el) {
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      if (maxScroll >= target - 1 || performance.now() >= deadline) {
        el.scrollTop = Math.min(target, maxScroll);
        stop();
        return;
      }
    } else if (performance.now() >= deadline) {
      stop();
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  document.addEventListener('touchstart', stop, { capture: true, passive: true });
  frame = requestAnimationFrame(tick);
  return stop;
}

/**
 * Going back returns to where the page was scrolled, as in a native navigation stack: open
 * an album from an artist's album list, swipe back, and the list is still in view. Each
 * history entry keeps the page scroller's last offset; a back / forward step restores it
 * once the page has grown tall enough.
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

  // Switch entries before the browser can report a scroll: the new page is often shorter and
  // clamps the offset, and that scroll event must not overwrite the entry being left.
  useLayoutEffect(() => {
    currentKey.current = location.key;
  }, [location.key]);

  useEffect(() => {
    if (navigationType !== 'POP') return;
    const saved = scrollByEntry.get(location.key) ?? 0;
    if (saved <= 0) return;
    // Starts on the next frame, after the app shell's own scroll reset for the new route.
    return restoreWhenTallEnough(saved);
  }, [location.key, navigationType]);
}

export function _resetMobileScrollMemoryForTest(): void {
  scrollByEntry.clear();
}
