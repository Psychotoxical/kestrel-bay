import { useEffect } from 'react';

/** Hold time before a touch counts as a long press. */
const LONG_PRESS_MS = 480;
/** Finger travel that turns a press into a scroll. */
const MOVE_TOLERANCE_PX = 10;
/** Elements with their own long-press meaning, or where a menu would get in the way. */
const EXCLUDED = 'input, textarea, select, [role="slider"], .long-press-play-btn, [data-no-touch-menu]';

/**
 * iOS has no right click: a long press dispatches `contextmenu` at the pressed
 * element, so every existing context menu (song, album, queue row, …) opens on
 * touch. The click that follows the long press is swallowed so the row does
 * not also play. Renderless; mounted once by the touch shell.
 */
export default function MobileTouchContextMenu() {
  useEffect(() => {
    let timer: number | undefined;
    let press: { x: number; y: number; target: Element } | null = null;
    let swallowClick = false;

    const cancel = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      press = null;
    };

    const onTouchStart = (e: TouchEvent) => {
      swallowClick = false;
      cancel();
      if (e.touches.length !== 1) return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest(EXCLUDED)) return;
      const touch = e.touches[0];
      press = { x: touch.clientX, y: touch.clientY, target };
      timer = window.setTimeout(() => {
        if (!press) return;
        const { x, y, target: pressed } = press;
        cancel();
        swallowClick = true;
        pressed.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 2,
        }));
      }, LONG_PRESS_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!press) return;
      const touch = e.touches[0];
      if (!touch) return;
      if (Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > MOVE_TOLERANCE_PX) cancel();
    };

    const onClick = (e: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
    document.addEventListener('touchend', cancel, { capture: true, passive: true });
    document.addEventListener('touchcancel', cancel, { capture: true, passive: true });
    document.addEventListener('click', onClick, true);
    return () => {
      cancel();
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('touchmove', onTouchMove, { capture: true });
      document.removeEventListener('touchend', cancel, { capture: true });
      document.removeEventListener('touchcancel', cancel, { capture: true });
      document.removeEventListener('click', onClick, true);
    };
  }, []);

  return null;
}
