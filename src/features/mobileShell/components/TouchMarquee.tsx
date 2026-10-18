import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  /** Re-measure when the content changes (e.g. the track). */
  measureKey?: string;
}

/**
 * One line that scrolls to its end and back when it is wider than its box, and stays
 * centred otherwise. Unlike `MarqueeText` it takes any content, so links inside
 * (the artist names) stay tappable. Uses the player bar's marquee animation.
 */
export default function TouchMarquee({ children, className, measureKey }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  const measure = useCallback(() => {
    const box = boxRef.current;
    const line = lineRef.current;
    if (!box || !line) return;
    const extra = line.scrollWidth - box.clientWidth;
    setOverflow(extra > 4 ? Math.ceil(extra) : 0);
  }, []);

  useEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (boxRef.current) observer.observe(boxRef.current);
    if (lineRef.current) observer.observe(lineRef.current);
    return () => observer.disconnect();
  }, [measure, measureKey]);

  const scrolling = overflow > 0;
  return (
    <div
      ref={boxRef}
      className={`marquee-wrap touch-marquee${scrolling ? ' is-scrolling' : ''}${className ? ` ${className}` : ''}`}
    >
      <span
        ref={lineRef}
        className={`touch-marquee__line${scrolling ? ' marquee-scroll' : ''}`}
        style={scrolling ? { '--marquee-amount': `-${overflow}px` } as CSSProperties : undefined}
      >
        {children}
      </span>
    </div>
  );
}
