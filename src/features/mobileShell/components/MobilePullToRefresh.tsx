import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { APP_MAIN_SCROLL_VIEWPORT_ID } from '@/constants/appScroll';
import { useHomeRefreshStore } from '@/features/home/store/homeRefreshStore';

/** Pull distance (after damping) that triggers a refresh on release. */
const TRIGGER_PX = 64;
/** Damped pull is capped here. */
const MAX_PX = 110;
/** Height the indicator keeps while the refresh runs. */
const REFRESHING_PX = 52;
/** The spinner never hangs: a refresh that does not report back ends after this. */
const REFRESH_TIMEOUT_MS = 10_000;

/**
 * Pull-to-refresh for the Mainstage: dragging down at the top of the page opens
 * a gap with a spinner; releasing past the threshold asks Home for a fresh feed
 * (new hero picks and rails). Mounted only by the Mainstage header.
 */
export default function MobilePullToRefresh() {
  const { t } = useTranslation();
  const refreshing = useHomeRefreshStore(s => s.refreshing);
  const [pull, setPull] = useState(0);
  const pullRef = useRef(0);

  useEffect(() => {
    const viewport = document.getElementById(APP_MAIN_SCROLL_VIEWPORT_ID);
    if (!viewport) return;
    let startY: number | null = null;

    const setPullPx = (px: number) => {
      pullRef.current = px;
      setPull(px);
    };

    const onTouchStart = (e: TouchEvent) => {
      startY = viewport.scrollTop <= 0 && e.touches.length === 1 ? e.touches[0].clientY : null;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY === null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || viewport.scrollTop > 0) {
        if (pullRef.current > 0) setPullPx(0);
        if (dy < 0) startY = null;
        return;
      }
      // Own the gesture while pulling: no native bounce on top of the gap.
      e.preventDefault();
      setPullPx(Math.min(MAX_PX, dy * 0.5));
    };
    const onTouchEnd = () => {
      if (startY === null) return;
      startY = null;
      if (pullRef.current >= TRIGGER_PX && !useHomeRefreshStore.getState().refreshing) {
        useHomeRefreshStore.getState().request();
      }
      setPullPx(0);
    };

    viewport.addEventListener('touchstart', onTouchStart, { passive: true });
    viewport.addEventListener('touchmove', onTouchMove, { passive: false });
    viewport.addEventListener('touchend', onTouchEnd, { passive: true });
    viewport.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('touchmove', onTouchMove);
      viewport.removeEventListener('touchend', onTouchEnd);
      viewport.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  useEffect(() => {
    if (!refreshing) return;
    const timer = window.setTimeout(() => useHomeRefreshStore.getState().finish(), REFRESH_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [refreshing]);

  const height = refreshing ? REFRESHING_PX : pull;
  const ready = pull >= TRIGGER_PX;

  return (
    <div
      className={`mobile-ptr${refreshing ? ' is-refreshing' : ''}${pull > 0 ? ' is-pulling' : ''}`}
      style={{ height }}
      role="status"
      aria-live="polite"
    >
      {(refreshing || pull > 0) && (
        <RefreshCw
          className="mobile-ptr__icon"
          size={22}
          strokeWidth={2.2}
          style={refreshing ? undefined : { transform: `rotate(${pull * 3}deg)`, opacity: ready ? 1 : 0.5 }}
          aria-label={refreshing ? t('common.loading') : undefined}
          aria-hidden={refreshing ? undefined : true}
        />
      )}
    </div>
  );
}
