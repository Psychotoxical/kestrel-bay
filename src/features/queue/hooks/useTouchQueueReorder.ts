import { useEffect, useState, type RefObject } from 'react';
import { edgeScrollSpeed } from '@/lib/dnd/useDragEdgeScroll';

/** Hold time before a queue row lifts off. */
export const LIFT_MS = 400;
/** Finger travel before the lift that means "scrolling", which cancels it. */
const SCROLL_TOLERANCE_PX = 10;
/** Travel after the lift that turns the hold into a drag; less is a long press. */
const DRAG_START_PX = 6;

export interface TouchDropTarget {
  idx: number;
  before: boolean;
}

interface Args {
  /** The queue list's scroll viewport. */
  listRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** Same contract as the desktop drop: indices to move and the gap to insert them at. */
  moveQueueItems: (indices: readonly number[], gapIndex: number) => void;
}

/** Rows that can be picked up: queue rows, not timeline history. */
const ROW_SELECTOR = '[data-queue-idx]:not([data-timeline-kind="history"])';

/**
 * Touch reordering for the queue sheet, the iOS way: hold a row and it lifts off
 * and follows the finger; the drop line shows where it lands, and holding near
 * the top or bottom scrolls the list along. Letting go without moving opens the
 * row's context menu instead, which the shell's generic long press would
 * otherwise have opened (the list opts out of that one).
 *
 * The lifted row is moved with a CSS variable, so dragging re-renders only when
 * the drop target changes.
 */
export function useTouchQueueReorder({ listRef, enabled, moveQueueItems }: Args): TouchDropTarget | null {
  const [target, setTarget] = useState<TouchDropTarget | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!enabled || !list) return;
    list.setAttribute('data-no-touch-menu', '');

    let timer: number | undefined;
    let press: { x: number; y: number; row: HTMLElement; idx: number; scrollTop: number } | null = null;
    let lifted = false;
    let dragging = false;
    let lastY = 0;
    let dropTarget: TouchDropTarget | null = null;
    let frame = 0;
    let lastFrameAt: number | null = null;

    const setDrop = (next: TouchDropTarget | null) => {
      if (next?.idx === dropTarget?.idx && next?.before === dropTarget?.before) return;
      dropTarget = next;
      setTarget(next);
    };

    const findDrop = (clientY: number, row: HTMLElement): TouchDropTarget | null => {
      for (const el of list.querySelectorAll<HTMLElement>(ROW_SELECTOR)) {
        if (el === row) continue;
        const rect = el.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return { idx: Number(el.dataset.queueIdx), before: clientY < rect.top + rect.height / 2 };
        }
      }
      return null;
    };

    const follow = () => {
      if (!press) return;
      // Keep the row under the finger while the list scrolls beneath it.
      const dy = lastY - press.y + (list.scrollTop - press.scrollTop);
      press.row.style.setProperty('--lift-dy', `${dy}px`);
      setDrop(findDrop(lastY, press.row));
    };

    const step = (now: number) => {
      const seconds = lastFrameAt === null ? 0 : (now - lastFrameAt) / 1000;
      lastFrameAt = now;
      const speed = edgeScrollSpeed(lastY, list.getBoundingClientRect());
      if (speed !== 0 && seconds > 0) {
        list.scrollTop += speed * seconds;
        follow();
      }
      frame = requestAnimationFrame(step);
    };

    const swallowNextClick = () => {
      const onClick = (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
      };
      document.addEventListener('click', onClick, { capture: true, once: true });
      window.setTimeout(() => document.removeEventListener('click', onClick, { capture: true }), 600);
    };

    const reset = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      cancelAnimationFrame(frame);
      lastFrameAt = null;
      if (press) {
        press.row.classList.remove('queue-item--lifted');
        press.row.style.removeProperty('--lift-dy');
        if (press.row.parentElement) press.row.parentElement.style.zIndex = '';
      }
      press = null;
      lifted = false;
      dragging = false;
      setDrop(null);
    };

    const lift = () => {
      if (!press) return;
      lifted = true;
      press.row.classList.add('queue-item--lifted');
      // Rows sit in their own absolutely positioned wrappers; raise this one above its siblings.
      if (press.row.parentElement) press.row.parentElement.style.zIndex = '5';
      frame = requestAnimationFrame(step);
    };

    const onTouchStart = (e: TouchEvent) => {
      reset();
      if (e.touches.length !== 1) return;
      const el = e.target instanceof Element ? e.target : null;
      if (!el || el.closest('button')) return;
      const row = el.closest<HTMLElement>(ROW_SELECTOR);
      if (!row) return;
      const touch = e.touches[0];
      press = { x: touch.clientX, y: touch.clientY, row, idx: Number(row.dataset.queueIdx), scrollTop: list.scrollTop };
      lastY = touch.clientY;
      timer = window.setTimeout(lift, LIFT_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!press) return;
      const touch = e.touches[0];
      if (!touch) return;
      if (!lifted) {
        if (Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > SCROLL_TOLERANCE_PX) reset();
        return;
      }
      // The row is in the finger now: the list must not scroll natively.
      e.preventDefault();
      lastY = touch.clientY;
      if (!dragging && Math.abs(touch.clientY - press.y) > DRAG_START_PX) dragging = true;
      if (dragging) follow();
    };

    const onTouchEnd = () => {
      if (!press || !lifted) {
        reset();
        return;
      }
      swallowNextClick();
      const { row, idx, x, y } = press;
      const drop = dropTarget;
      const wasDragging = dragging;
      reset();
      if (wasDragging) {
        if (drop) moveQueueItems([idx], drop.before ? drop.idx : drop.idx + 1);
        return;
      }
      row.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2,
      }));
    };

    list.addEventListener('touchstart', onTouchStart, { passive: true });
    list.addEventListener('touchmove', onTouchMove, { passive: false });
    list.addEventListener('touchend', onTouchEnd);
    list.addEventListener('touchcancel', reset);
    return () => {
      reset();
      list.removeAttribute('data-no-touch-menu');
      list.removeEventListener('touchstart', onTouchStart);
      list.removeEventListener('touchmove', onTouchMove);
      list.removeEventListener('touchend', onTouchEnd);
      list.removeEventListener('touchcancel', reset);
    };
  }, [listRef, enabled, moveQueueItems]);

  return target;
}
