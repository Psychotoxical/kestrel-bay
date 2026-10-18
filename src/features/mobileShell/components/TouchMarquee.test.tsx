import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import TouchMarquee from './TouchMarquee';

function widths(scrollWidth: number, clientWidth: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => scrollWidth });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => clientWidth });
}

describe('TouchMarquee', () => {
  it('stays still and centred when the line fits', () => {
    widths(200, 300);
    const { container } = render(<TouchMarquee>Short</TouchMarquee>);
    const box = container.firstElementChild as HTMLElement;
    expect(box).not.toHaveClass('is-scrolling');
    expect(box.querySelector('.marquee-scroll')).toBeNull();
  });

  it('scrolls by the overflow when the line is wider than its box', () => {
    widths(420, 300);
    const { container } = render(<TouchMarquee>A very long band name</TouchMarquee>);
    const box = container.firstElementChild as HTMLElement;
    const line = box.querySelector('.touch-marquee__line') as HTMLElement;
    expect(box).toHaveClass('is-scrolling');
    expect(line).toHaveClass('marquee-scroll');
    expect(line.style.getPropertyValue('--marquee-amount')).toBe('-120px');
  });
});
