import { useCallback, useRef } from 'react';

/**
 * Callback ref that shrinks a single-line element's font size (1px steps,
 * `maxPx` down to `minPx`) until its text fits its width. Below `minPx` the
 * element's own overflow rule (e.g. ellipsis) takes over. Re-fits when the
 * element resizes, its text changes, or web fonts finish loading.
 * Disabled: the ref does nothing and the stylesheet size applies.
 */
export function useFitTextToWidth(
  enabled: boolean,
  maxPx: number,
  minPx: number,
): (el: HTMLElement | null) => void {
  const cleanupRef = useRef<(() => void) | null>(null);

  return useCallback((el: HTMLElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!enabled || !el) return;

    let disposed = false;
    const fit = () => {
      if (disposed) return;
      let size = maxPx;
      el.style.fontSize = `${size}px`;
      while (size > minPx && el.scrollWidth > el.clientWidth) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    };

    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(el);
    const text = new MutationObserver(fit);
    text.observe(el, { characterData: true, childList: true, subtree: true });
    void document.fonts?.ready.then(fit);

    cleanupRef.current = () => {
      disposed = true;
      resize.disconnect();
      text.disconnect();
      el.style.fontSize = '';
    };
  }, [enabled, maxPx, minPx]);
}
