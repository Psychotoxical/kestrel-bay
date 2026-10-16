import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { dispatchTouch } from '@/test/helpers/touch';
import { LIFT_MS, useTouchQueueReorder } from '@/features/queue/hooks/useTouchQueueReorder';

const ROW_H = 50;

function Harness({ enabled = true, moveQueueItems, history = false }: {
  enabled?: boolean;
  moveQueueItems: (indices: readonly number[], gap: number) => void;
  history?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const target = useTouchQueueReorder({ listRef, enabled, moveQueueItems });
  return (
    <>
      <div ref={listRef} data-testid="list">
        {[0, 1, 2, 3].map(i => (
          <div key={i}>
            <div
              data-queue-idx={i}
              data-testid={`row-${i}`}
              {...(history && i === 0 ? { 'data-timeline-kind': 'history' } : {})}
            >
              Row {i}
              <button type="button">star {i}</button>
            </div>
          </div>
        ))}
      </div>
      <output data-testid="target">{target ? `${target.idx}:${target.before ? 'before' : 'after'}` : 'none'}</output>
    </>
  );
}

/** jsdom has no layout: rows stack at 50 px each; the list is tall enough that no edge scrolls. */
function mockLayout() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === 'list') return new DOMRect(0, -1000, 400, 3000);
    const idx = this.dataset.queueIdx;
    if (idx !== undefined) return new DOMRect(0, Number(idx) * ROW_H, 400, ROW_H);
    return new DOMRect(0, 0, 0, 0);
  });
}

const row = (i: number) => screen.getByTestId(`row-${i}`);
const at = (y: number) => ({ x: 100, y });
const hold = () => act(() => { vi.advanceTimersByTime(LIFT_MS); });

describe('useTouchQueueReorder', () => {
  let layout: ReturnType<typeof mockLayout>;

  beforeEach(() => {
    vi.useFakeTimers();
    layout = mockLayout();
  });

  afterEach(() => {
    layout.mockRestore();
    vi.useRealTimers();
  });

  it('a held row lifts, follows the finger and moves to the drop line', () => {
    const move = vi.fn();
    render(<Harness moveQueueItems={move} />);
    act(() => { dispatchTouch(row(0), 'touchstart', at(25)); });
    hold();
    expect(row(0).classList.contains('queue-item--lifted')).toBe(true);

    // Upper half of row 3 → in front of it, i.e. into gap 3.
    act(() => { dispatchTouch(row(0), 'touchmove', at(90)); });
    act(() => { dispatchTouch(row(0), 'touchmove', at(160)); });
    expect(screen.getByTestId('target')).toHaveTextContent('3:before');
    expect(row(0).style.getPropertyValue('--lift-dy')).toBe('135px');

    act(() => { dispatchTouch(row(0), 'touchend', at(160)); });
    expect(move).toHaveBeenCalledWith([0], 3);
    expect(row(0).classList.contains('queue-item--lifted')).toBe(false);
    expect(screen.getByTestId('target')).toHaveTextContent('none');
  });

  it('dropping on the lower half of a row inserts after it', () => {
    const move = vi.fn();
    render(<Harness moveQueueItems={move} />);
    act(() => { dispatchTouch(row(3), 'touchstart', at(175)); });
    hold();
    act(() => { dispatchTouch(row(3), 'touchmove', at(40)); });
    act(() => { dispatchTouch(row(3), 'touchend', at(40)); });
    expect(move).toHaveBeenCalledWith([3], 1);
  });

  it('blocks native scrolling once the row is in the finger', () => {
    render(<Harness moveQueueItems={vi.fn()} />);
    act(() => { dispatchTouch(row(1), 'touchstart', at(75)); });
    hold();
    let moveEvent: Event | undefined;
    act(() => { moveEvent = dispatchTouch(row(1), 'touchmove', at(120)); });
    expect(moveEvent?.defaultPrevented).toBe(true);
  });

  it('moving the finger before the hold time scrolls instead of lifting', () => {
    const move = vi.fn();
    render(<Harness moveQueueItems={move} />);
    act(() => { dispatchTouch(row(1), 'touchstart', at(75)); });
    let moveEvent: Event | undefined;
    act(() => { moveEvent = dispatchTouch(row(1), 'touchmove', at(110)); });
    hold();
    expect(moveEvent?.defaultPrevented).toBe(false);
    expect(row(1).classList.contains('queue-item--lifted')).toBe(false);
    act(() => { dispatchTouch(row(1), 'touchend', at(110)); });
    expect(move).not.toHaveBeenCalled();
  });

  it('holding without moving opens the row menu on release', () => {
    const move = vi.fn();
    render(<Harness moveQueueItems={move} />);
    const onMenu = vi.fn();
    row(2).addEventListener('contextmenu', onMenu);
    act(() => { dispatchTouch(row(2), 'touchstart', at(125)); });
    hold();
    act(() => { dispatchTouch(row(2), 'touchend', at(125)); });
    expect(onMenu).toHaveBeenCalledTimes(1);
    expect(move).not.toHaveBeenCalled();
  });

  it('swallows the click that follows the hold, so the row does not also play', () => {
    render(<Harness moveQueueItems={vi.fn()} />);
    const onClick = vi.fn();
    row(2).addEventListener('click', onClick);
    act(() => { dispatchTouch(row(2), 'touchstart', at(125)); });
    hold();
    act(() => { dispatchTouch(row(2), 'touchend', at(125)); });
    act(() => { row(2).click(); });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('leaves buttons in the row and timeline history alone', () => {
    const { unmount } = render(<Harness moveQueueItems={vi.fn()} />);
    act(() => { dispatchTouch(screen.getByText('star 1'), 'touchstart', at(75)); });
    hold();
    expect(row(1).classList.contains('queue-item--lifted')).toBe(false);
    unmount();

    render(<Harness moveQueueItems={vi.fn()} history />);
    act(() => { dispatchTouch(row(0), 'touchstart', at(25)); });
    hold();
    expect(row(0).classList.contains('queue-item--lifted')).toBe(false);
  });

  it('opts the list out of the shell-wide long-press menu only while enabled', () => {
    const { rerender } = render(<Harness moveQueueItems={vi.fn()} />);
    expect(screen.getByTestId('list').hasAttribute('data-no-touch-menu')).toBe(true);
    rerender(<Harness moveQueueItems={vi.fn()} enabled={false} />);
    expect(screen.getByTestId('list').hasAttribute('data-no-touch-menu')).toBe(false);
  });
});
