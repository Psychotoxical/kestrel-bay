import { useEffect, useRef, useState, type RefObject } from 'react';
import { edgeScrollSpeed } from '@/lib/dnd/useDragEdgeScroll';

/** Hold time before a row lifts off. */
export const LIFT_MS = 400;
/** Finger travel before the lift that means "scrolling", which cancels it. */
const SCROLL_TOLERANCE_PX = 10;
/** Travel after the lift that turns the hold into a drag; less is a long press. */
const DRAG_START_PX = 6;

export interface TouchDropTarget {
  idx: number;
  before: boolean;
  /** The row under the finger (for lists that identify rows by attribute, not index). */
  row: HTMLElement;
}

export interface TouchListReorderOptions {
  /** The element the rows live in (touches are watched here). */
  listRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** Rows that can be picked up. */
  rowSelector: string;
  /** `data-*` attribute on each row holding its list index, e.g. `data-queue-idx`;
   *  without it a row's index is its position among the rows. */
  indexAttr?: string;
  /** Touches that start inside these keep their own meaning (buttons in the row). */
  ignoreSelector: string;
  /** When set, only touches that start inside this (a grip) pick a row up. */
  handleSelector?: string;
  /** Hold time before the row lifts; `LIFT_MS` when omitted (a grip can lift at once). */
  liftDelayMs?: number;
  /** Class on the held row; the row moves with the `--lift-dy` CSS variable. */
  liftedClass: string;
  /** Element that scrolls under the finger; the list itself when omitted. */
  getScroller?: () => HTMLElement | null;
  /** The held row (index `fromIdx`, element `fromRow`) was dropped in front of / behind `target`. */
  onDrop: (fromIdx: number, target: TouchDropTarget, fromRow: HTMLElement) => void;
}

/**
 * Touch reordering, the iOS way: hold a row and it lifts off and follows the
 * finger; the returned drop target says where it lands, and holding near the
 * top or bottom of the scroller scrolls along. Letting go without moving opens
 * the row's context menu instead (a `contextmenu` event on the row), which the
 * shell's generic long press would otherwise have opened — the list opts out
 * of that one while this is enabled.
 *
 * The held row is moved with a CSS variable, so dragging re-renders only when
 * the drop target changes. Callbacks are read through a ref, so callers may
 * pass inline functions.
 */
export function useTouchListReorder(options: TouchListReorderOptions): TouchDropTarget | null {
  const { listRef, enabled, rowSelector, indexAttr, ignoreSelector, liftedClass } = options;
  const [target, setTarget] = useState<TouchDropTarget | null>(null);
  const latest = useRef(options);
  useEffect(() => { latest.current = options; });

  useEffect(() => {
    const list = listRef.current;
    if (!enabled || !list) return;
    list.setAttribute('data-no-touch-menu', '');
    const scroller = () => latest.current.getScroller?.() ?? list;
    const indexOf = (row: HTMLElement) => (indexAttr
      ? Number(row.getAttribute(indexAttr))
      : [...list.querySelectorAll(rowSelector)].indexOf(row));

    let timer: number | undefined;
    let press: { x: number; y: number; row: HTMLElement; idx: number; scrollTop: number } | null = null;
    let lifted = false;
    let dragging = false;
    let lastY = 0;
    let dropTarget: TouchDropTarget | null = null;
    let frame = 0;
    let lastFrameAt: number | null = null;

    const setDrop = (next: TouchDropTarget | null) => {
      if (next?.row === dropTarget?.row && next?.before === dropTarget?.before) return;
      dropTarget = next;
      setTarget(next);
    };

    const findDrop = (clientY: number, row: HTMLElement): TouchDropTarget | null => {
      for (const el of list.querySelectorAll<HTMLElement>(rowSelector)) {
        if (el === row) continue;
        const rect = el.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return { idx: indexOf(el), before: clientY < rect.top + rect.height / 2, row: el };
        }
      }
      return null;
    };

    const follow = () => {
      if (!press) return;
      // Keep the row under the finger while the content scrolls beneath it.
      const dy = lastY - press.y + (scroller().scrollTop - press.scrollTop);
      press.row.style.setProperty('--lift-dy', `${dy}px`);
      setDrop(findDrop(lastY, press.row));
    };

    const step = (now: number) => {
      const seconds = lastFrameAt === null ? 0 : (now - lastFrameAt) / 1000;
      lastFrameAt = now;
      const el = scroller();
      const speed = edgeScrollSpeed(lastY, el.getBoundingClientRect());
      if (speed !== 0 && seconds > 0) {
        el.scrollTop += speed * seconds;
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
        press.row.classList.remove(liftedClass);
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
      press.row.classList.add(liftedClass);
      // Virtualized rows sit in their own positioned wrappers; raise this one above its siblings.
      if (press.row.parentElement) press.row.parentElement.style.zIndex = '5';
      frame = requestAnimationFrame(step);
    };

    const onTouchStart = (e: TouchEvent) => {
      reset();
      if (e.touches.length !== 1) return;
      const el = e.target instanceof Element ? e.target : null;
      if (!el || el.closest(ignoreSelector)) return;
      const handle = latest.current.handleSelector;
      if (handle && !el.closest(handle)) return;
      const row = el.closest<HTMLElement>(rowSelector);
      if (!row || !list.contains(row)) return;
      const touch = e.touches[0];
      press = { x: touch.clientX, y: touch.clientY, row, idx: indexOf(row), scrollTop: scroller().scrollTop };
      lastY = touch.clientY;
      timer = window.setTimeout(lift, latest.current.liftDelayMs ?? LIFT_MS);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!press) return;
      const touch = e.touches[0];
      if (!touch) return;
      if (!lifted) {
        if (Math.hypot(touch.clientX - press.x, touch.clientY - press.y) > SCROLL_TOLERANCE_PX) reset();
        return;
      }
      // The row is in the finger now: the content must not scroll natively.
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
        if (drop) latest.current.onDrop(idx, drop, row);
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
  }, [listRef, enabled, rowSelector, indexAttr, ignoreSelector, liftedClass]);

  return target;
}
