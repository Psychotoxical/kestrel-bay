import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router';
import { activeMobileTab, isMobileTabRoot, MOBILE_TAB_ROOTS } from '@/features/mobileShell/utils/mobileTabs';

/** Horizontal travel before the page starts following the finger. */
const START_PX = 16;
/** Horizontal travel that navigates on release. */
const COMMIT_PX = 90;
/** Horizontal movement has to dominate vertical movement by this factor. */
const DIRECTION_RATIO = 2;
/** Elements that swipe sideways themselves (rails, chips, hero carousel, sliders). */
const EXCLUDED = [
  '.album-grid', '.song-grid', '.mobile-chips', '.mobile-chip-row', '.mobile-segmented',
  '.hero', 'input', 'textarea', '[role="slider"]', 'canvas', '[data-no-swipe-nav]',
].join(', ');

function historyIdx(): number {
  return (window.history.state as { idx?: number } | null)?.idx ?? 0;
}

/**
 * iOS-style page swipes in the touch shell: swipe right goes one step back,
 * swipe left goes forward again when there is a forward entry. The page follows
 * the finger and springs back when released short of the threshold. Renderless.
 */
export default function MobileSwipeNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const maxIdxRef = useRef(historyIdx());
  const stateRef = useRef({ navigate, pathname: location.pathname });
  useEffect(() => {
    stateRef.current = { navigate, pathname: location.pathname };
  });

  // Forward is possible while we are below the furthest entry of the current branch.
  useEffect(() => {
    const idx = historyIdx();
    if (navigationType === 'PUSH') maxIdxRef.current = idx;
    else maxIdxRef.current = Math.max(maxIdxRef.current, idx);
  }, [location.key, navigationType]);

  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let active = false;
    let dx = 0;
    let page: HTMLElement | null = null;

    const setOffset = (px: number, animate: boolean) => {
      if (!page) return;
      page.style.transition = animate ? 'transform 0.2s ease-out' : 'none';
      page.style.transform = px === 0 ? '' : `translateX(${px}px)`;
    };

    const canGoBack = () => historyIdx() > 0 || !isMobileTabRoot(stateRef.current.pathname);
    const canGoForward = () => historyIdx() < maxIdxRef.current;

    const onTouchStart = (e: TouchEvent) => {
      start = null;
      active = false;
      dx = 0;
      if (e.touches.length !== 1 || stateRef.current.pathname === '/now-playing') return;
      const target = e.target instanceof Element ? e.target : null;
      page = target?.closest<HTMLElement>('.app-shell[data-mobile-app] .main-content-zoom') ?? null;
      if (!page || target?.closest(EXCLUDED)) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!start) return;
      const touch = e.touches[0];
      const moveX = touch.clientX - start.x;
      const moveY = touch.clientY - start.y;
      if (!active) {
        if (Math.abs(moveY) > START_PX && Math.abs(moveY) > Math.abs(moveX)) { start = null; return; }
        if (Math.abs(moveX) < START_PX || Math.abs(moveX) < Math.abs(moveY) * DIRECTION_RATIO) return;
        if (moveX > 0 ? !canGoBack() : !canGoForward()) { start = null; return; }
        active = true;
      }
      dx = moveX;
      setOffset(dx * 0.85, false);
    };

    const onTouchEnd = () => {
      if (!start || !active) { start = null; return; }
      start = null;
      active = false;
      if (Math.abs(dx) < COMMIT_PX) {
        setOffset(0, true);
        return;
      }
      const back = dx > 0;
      setOffset(back ? window.innerWidth : -window.innerWidth, true);
      window.setTimeout(() => {
        const { navigate: go, pathname } = stateRef.current;
        if (back) {
          if (historyIdx() > 0) go(-1);
          else go(MOBILE_TAB_ROOTS[activeMobileTab(pathname) ?? 'mainstage'], { replace: true });
        } else {
          go(1);
        }
        setOffset(0, false);
      }, 180);
    };

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { capture: true, passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('touchmove', onTouchMove, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', onTouchEnd, { capture: true });
      setOffset(0, false);
    };
  }, []);

  return null;
}
