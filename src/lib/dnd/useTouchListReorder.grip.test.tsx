/** A grip lifts its row at once; the rest of the row keeps its own touch meaning. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { dispatchTouch } from '@/test/helpers/touch';
import { LIFT_MS, useTouchListReorder, type TouchDropTarget } from '@/lib/dnd/useTouchListReorder';

const ROW_H = 60;

function Harness({ onDrop }: { onDrop: (from: number, target: TouchDropTarget) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  useTouchListReorder({
    listRef,
    enabled: true,
    rowSelector: '[data-row-idx]',
    indexAttr: 'data-row-idx',
    ignoreSelector: '.main',
    handleSelector: '.grip',
    liftDelayMs: 0,
    liftedClass: 'is-lifted',
    onDrop: (from, t) => onDrop(from, t),
  });
  return (
    <div ref={listRef}>
      {[0, 1, 2].map(i => (
        <div key={i} data-row-idx={i} data-testid={`row-${i}`}>
          <button type="button" className="main">Song {i}</button>
          <span>Title {i}</span>
          <button type="button" className="grip">grip {i}</button>
        </div>
      ))}
    </div>
  );
}

const at = (y: number) => ({ x: 380, y });

describe('useTouchListReorder with a grip', () => {
  let layout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    layout = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const idx = this.getAttribute('data-row-idx');
      return idx !== null ? new DOMRect(0, Number(idx) * ROW_H, 400, ROW_H) : new DOMRect(0, 0, 400, 400);
    });
  });

  afterEach(() => {
    layout.mockRestore();
    vi.useRealTimers();
  });

  it('a touch on the grip lifts at once and the row can be dropped', () => {
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} />);
    const grip = screen.getByText('grip 2');
    act(() => { dispatchTouch(grip, 'touchstart', at(150)); });
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByTestId('row-2')).toHaveClass('is-lifted');
    act(() => { dispatchTouch(grip, 'touchmove', at(100)); });
    act(() => { dispatchTouch(grip, 'touchmove', at(10)); });
    act(() => { dispatchTouch(grip, 'touchend', at(10)); });
    expect(onDrop).toHaveBeenCalledWith(2, expect.objectContaining({ idx: 0, before: true }));
  });

  it('holding the rest of the row lifts nothing', () => {
    render(<Harness onDrop={vi.fn()} />);
    act(() => { dispatchTouch(screen.getByText('Title 1'), 'touchstart', at(90)); });
    act(() => { vi.advanceTimersByTime(LIFT_MS * 2); });
    expect(screen.getByTestId('row-1')).not.toHaveClass('is-lifted');
  });
});
