import { useEffect } from 'react';
import { useLocation } from 'react-router';

/** Attribute on `<html>` the touch-shell CSS reads to fold the bottom bars into one row. */
export const MOBILE_BARS_ATTR = 'data-mobile-bars';

/** Travel in one direction before the bars fold or unfold, so a jittery finger does not flip them. */
const DIRECTION_PX = 12;
/** Close to the top of a page the bars always stay unfolded. */
const TOP_PX = 24;

function setCollapsed(collapsed: boolean) {
  const root = document.documentElement;
  if (collapsed) root.setAttribute(MOBILE_BARS_ATTR, 'collapsed');
  else root.removeAttribute(MOBILE_BARS_ATTR);
}

/**
 * Folds the player bar and the tab bar into one row while the page scrolls down,
 * and unfolds them when it scrolls back up or reaches the top — the platform music
 * app's pattern. Only page scrollers count (the route host, including in-page browse
 * areas); sheets live outside it and sideways rails do not change `scrollTop`.
 * Driven by an attribute instead of React state, so scrolling renders nothing.
 */
export function useCollapseBarsOnScroll(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    const lastTop = new WeakMap<Element, number>();
    let travel = 0;
    let travelTarget: Element | null = null;

    const onScroll = (event: Event) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || !el.closest('.app-shell-route-host')) return;
      const top = el.scrollTop;
      const prev = lastTop.get(el);
      lastTop.set(el, top);
      if (prev === undefined || top === prev) return;
      if (top <= TOP_PX) {
        travel = 0;
        setCollapsed(false);
        return;
      }
      const delta = top - prev;
      if (travelTarget !== el || Math.sign(delta) !== Math.sign(travel)) travel = 0;
      travelTarget = el;
      travel += delta;
      if (travel > DIRECTION_PX) setCollapsed(true);
      else if (travel < -DIRECTION_PX) setCollapsed(false);
    };

    // Scroll events do not bubble; the capture phase sees every scroller on the page.
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      setCollapsed(false);
    };
  }, []);

  // A new page starts at its top, with the bars unfolded.
  useEffect(() => {
    setCollapsed(false);
  }, [pathname]);
}
