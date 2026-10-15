import { useEffect, useRef, useState, type ReactNode } from 'react';
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

/** Drag distance (px) past which releasing the grabber closes the sheet. */
const DISMISS_DRAG_PX = 110;

/**
 * iOS-style bottom sheet: dimmed backdrop, grabber, header with a close
 * button. Closes on backdrop tap, Escape, or dragging the header down.
 */
export default function MobileSheet({ title, hideTitle, onClose, className, children }: Props) {
  const { t } = useTranslation();
  const [dragY, setDragY] = useState(0);
  const dragStartRef = useRef<number | null>(null);
  // Read on release: the last move may not have rendered yet.
  const dragYRef = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    dragStartRef.current = e.clientY;
    dragYRef.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragStartRef.current === null) return;
    dragYRef.current = Math.max(0, e.clientY - dragStartRef.current);
    setDragY(dragYRef.current);
  };
  const onPointerUp = () => {
    if (dragStartRef.current === null) return;
    dragStartRef.current = null;
    if (dragYRef.current > DISMISS_DRAG_PX) onClose();
    else setDragY(0);
  };

  return createPortal(
    <div className="mobile-sheet-backdrop" onClick={onClose}>
      <div
        className={`mobile-sheet${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        style={dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className="mobile-sheet__header"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span className="mobile-sheet__grabber" aria-hidden="true" />
          <div className="mobile-sheet__header-row">
            {hideTitle ? <span /> : <h2 className="mobile-sheet__title">{title}</h2>}
            <button type="button" className="mobile-pill-btn" onClick={onClose}>
              {t('common.close')}
            </button>
          </div>
        </div>
        <div className="mobile-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
