import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

interface Props {
  /** Heading shown in the sheet header and used as the dialog name. */
  title: string;
  /** Hide the visible heading (the content brings its own); the dialog keeps `title` as its name. */
  hideTitle?: boolean;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

/** Drag distance (px) past which releasing the sheet closes it. */
const DISMISS_DRAG_PX = 110;
/** A downward flick this fast (px/ms) closes the sheet from a shorter drag. */
const DISMISS_FLICK_SPEED = 0.5;
/** The shortest drag (px) a flick needs, so a tap never closes. */
const DISMISS_FLICK_MIN_PX = 24;
/** How long the sheet takes to slide out; matches the closing transition below. */
const CLOSE_MS = 240;

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * iOS-style bottom sheet: dimmed backdrop, grabber, header with a close
 * button. Closes on backdrop tap, Escape, or dragging it down — by the header,
 * or by its content once that is scrolled to the top. The sheet follows the
 * finger and slides out when it closes, as iOS sheets do; before, it jumped
 * shut (TestFlight 22.10.).
 */
export default function MobileSheet({ title, hideTitle, onClose, className, children }: Props) {
  const { t } = useTranslation();
  const [dragY, setDragY] = useState(0);
  const [closing, setClosing] = useState(false);
  /** The sheet's height when the drag began: the dimming lightens over it. */
  const [dragRange, setDragRange] = useState(1);
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<number | null>(null);
  // Read on release: the last move may not have rendered yet.
  const dragYRef = useRef(0);
  /** Last two moves, for the release speed. */
  const lastMoveRef = useRef<{ y: number; at: number; speed: number }>({ y: 0, at: 0, speed: 0 });
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    if (reducedMotion()) {
      onCloseRef.current();
      return;
    }
    closingRef.current = true;
    setClosing(true);
    window.setTimeout(() => onCloseRef.current(), CLOSE_MS);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') requestClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [requestClose]);

  const startDrag = (y: number) => {
    setDragRange(sheetRef.current?.offsetHeight || 1);
    dragStartRef.current = y;
    dragYRef.current = 0;
    lastMoveRef.current = { y, at: performance.now(), speed: 0 };
  };
  const moveDrag = (y: number) => {
    if (dragStartRef.current === null) return;
    const now = performance.now();
    const last = lastMoveRef.current;
    const elapsed = now - last.at;
    lastMoveRef.current = { y, at: now, speed: elapsed > 0 ? (y - last.y) / elapsed : last.speed };
    dragYRef.current = Math.max(0, y - dragStartRef.current);
    setDragY(dragYRef.current);
  };
  const endDrag = () => {
    if (dragStartRef.current === null) return;
    dragStartRef.current = null;
    const flicked = lastMoveRef.current.speed > DISMISS_FLICK_SPEED && dragYRef.current > DISMISS_FLICK_MIN_PX;
    if (dragYRef.current > DISMISS_DRAG_PX || flicked) requestClose();
    else setDragY(0);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    startDrag(e.clientY);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  // The content scrolls natively, so its drag is followed by touch events: once it sits at
  // the top, pulling further down moves the sheet instead of rubber-banding the list.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    let startY: number | null = null;
    let dragging = false;
    const onStart = (e: TouchEvent) => {
      startY = e.touches.length === 1 ? e.touches[0].clientY : null;
      dragging = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const y = e.touches[0].clientY;
      if (!dragging) {
        if (y - startY <= 0 || body.scrollTop > 0) {
          if (y - startY < 0) startY = null;
          return;
        }
        dragging = true;
        startDrag(y);
      }
      e.preventDefault();
      moveDrag(y);
    };
    const onEnd = () => {
      startY = null;
      if (dragging) endDrag();
      dragging = false;
    };
    body.addEventListener('touchstart', onStart, { passive: true });
    body.addEventListener('touchmove', onMove, { passive: false });
    body.addEventListener('touchend', onEnd);
    body.addEventListener('touchcancel', onEnd);
    return () => {
      body.removeEventListener('touchstart', onStart);
      body.removeEventListener('touchmove', onMove);
      body.removeEventListener('touchend', onEnd);
      body.removeEventListener('touchcancel', onEnd);
    };
    // The handlers only touch refs and state setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sheetStyle = closing
    ? { transform: 'translateY(100%)', transition: `transform ${CLOSE_MS}ms cubic-bezier(0.4, 0, 1, 1)` }
    : dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined;
  // The dimming lightens with the drag; the backdrop's opacity would fade the sheet too.
  const backdropStyle = closing
    ? { background: 'rgba(0, 0, 0, 0)', transition: `background ${CLOSE_MS}ms ease` }
    : dragY > 0
      ? { background: `rgba(0, 0, 0, ${(0.45 * (1 - Math.min(dragY / dragRange, 1))).toFixed(3)})` }
      : undefined;

  return createPortal(
    <div className="mobile-sheet-backdrop" onClick={requestClose} style={backdropStyle}>
      <div
        ref={sheetRef}
        className={`mobile-sheet${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        style={sheetStyle}
      >
        <div
          className="mobile-sheet__header"
          onPointerDown={onPointerDown}
          onPointerMove={e => moveDrag(e.clientY)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="mobile-sheet__grabber" aria-hidden="true" />
          <div className="mobile-sheet__header-row">
            {hideTitle ? <span /> : <h2 className="mobile-sheet__title">{title}</h2>}
            <button type="button" className="mobile-pill-btn" onClick={requestClose}>
              {t('common.close')}
            </button>
          </div>
        </div>
        <div ref={bodyRef} className="mobile-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
