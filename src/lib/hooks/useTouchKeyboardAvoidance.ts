import { useEffect, type RefObject } from 'react';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

/** Room kept between a focused field and the keyboard (its toolbar sits on top of it). */
const FIELD_CLEARANCE_PX = 72;
/** iOS opens the keyboard with an animation; measure once it has settled. */
const KEYBOARD_SETTLE_MS = 320;

/**
 * Touch shell: keeps a focused field of a scrolling page above the on-screen
 * keyboard. The page gets `--keyboard-inset` (the keyboard's height, from the
 * visual viewport) so it can scroll far enough, and a field the keyboard would
 * cover is scrolled up into the visible part. No-op on desktop.
 */
export function useTouchKeyboardAvoidance(pageRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const page = pageRef.current;
    const viewport = window.visualViewport;
    if (!IS_MOBILE_SHELL || !page || !viewport) return;

    const syncInset = () => {
      const covered = window.innerHeight - viewport.height - viewport.offsetTop;
      page.style.setProperty('--keyboard-inset', `${Math.max(0, Math.round(covered))}px`);
    };
    let timer: number | undefined;
    const reveal = (event: FocusEvent) => {
      const field = event.target;
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        syncInset();
        const rect = field.getBoundingClientRect();
        const visibleTop = viewport.offsetTop;
        const visibleBottom = viewport.offsetTop + viewport.height - FIELD_CLEARANCE_PX;
        if (rect.top >= visibleTop && rect.bottom <= visibleBottom) return;
        // Bring the field to the upper third of what stays visible above the keyboard.
        page.scrollBy({ top: rect.top - (visibleTop + viewport.height / 3), behavior: 'smooth' });
      }, KEYBOARD_SETTLE_MS);
    };

    syncInset();
    viewport.addEventListener('resize', syncInset);
    page.addEventListener('focusin', reveal);
    return () => {
      window.clearTimeout(timer);
      viewport.removeEventListener('resize', syncInset);
      page.removeEventListener('focusin', reveal);
    };
  }, [pageRef]);
}
