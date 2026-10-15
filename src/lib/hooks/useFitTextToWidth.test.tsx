import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useFitTextToWidth } from './useFitTextToWidth';

function Title({ enabled, text }: { enabled: boolean; text: string }) {
  const ref = useFitTextToWidth(enabled, 23, 15);
  return <h2 ref={ref} data-testid="title">{text}</h2>;
}

const fontPx = (el: HTMLElement) => parseFloat(el.style.fontSize || '23');

describe('useFitTextToWidth', () => {
  let widthSpy: ReturnType<typeof vi.spyOn>;
  let scrollSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // jsdom has no layout: a 100px box whose text is 0.2px wide per character
    // and px of font size.
    widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
    scrollSpy = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return (this.textContent?.length ?? 0) * fontPx(this) * 0.2;
    });
  });
  afterEach(() => {
    widthSpy.mockRestore();
    scrollSpy.mockRestore();
  });

  it('keeps the largest size when the text already fits', () => {
    render(<Title enabled text="Short" />);
    expect(screen.getByTestId('title').style.fontSize).toBe('23px');
  });

  it('shrinks a long title until it fits', () => {
    // 25 chars: 25 * size * 0.2 <= 100  →  size <= 20.
    render(<Title enabled text="A title of 25 characters!" />);
    expect(screen.getByTestId('title').style.fontSize).toBe('20px');
  });

  it('stops at the minimum and leaves the rest to the ellipsis', () => {
    render(<Title enabled text={'x'.repeat(80)} />);
    expect(screen.getByTestId('title').style.fontSize).toBe('15px');
  });

  it('refits when the text changes', async () => {
    const { rerender } = render(<Title enabled text="Short" />);
    rerender(<Title enabled text="A title of 25 characters!" />);
    await new Promise(r => setTimeout(r, 0));
    expect(screen.getByTestId('title').style.fontSize).toBe('20px');
  });

  it('does nothing when disabled (desktop)', () => {
    render(<Title enabled={false} text={'x'.repeat(80)} />);
    expect(screen.getByTestId('title').style.fontSize).toBe('');
  });
});
