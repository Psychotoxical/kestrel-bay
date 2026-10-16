import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { dispatchTouch } from '@/test/helpers/touch';
import { LIFT_MS, useTouchListReorder, type TouchDropTarget } from '@/lib/dnd/useTouchListReorder';

const ROW_H = 60;

/** Radio-like list: each row is one big button plus an icon button; the page scrolls, not the list. */
function Harness({ onDrop, scroller }: {
  onDrop: (from: number, target: TouchDropTarget, fromRow: HTMLElement) => void;
  scroller: HTMLElement;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [renders, setRenders] = useState(0);
  const target = useTouchListReorder({
    listRef,
    enabled: true,
    rowSelector: '[data-row-idx]',
    indexAttr: 'data-row-idx',
    ignoreSelector: '.icon',
    liftedClass: 'is-lifted',
    getScroller: () => scroller,
    // A fresh function on every render, as callers write it inline.
    onDrop: (from, t, fromRow) => onDrop(from, t, fromRow),
  });
  return (
    <>
      <div ref={listRef} data-testid="list">
        {[0, 1, 2, 3].map(i => (
          <div key={i} data-row-idx={i} data-testid={`row-${i}`}>
            <button type="button">Station {i}</button>
            <button type="button" className="icon">fav {i}</button>
          </div>
        ))}
      </div>
      <output data-testid="target">{target ? `${target.idx}:${target.before ? 'before' : 'after'}` : 'none'}</output>
      <button type="button" onClick={() => setRenders(n => n + 1)}>rerender {renders}</button>
    </>
  );
}

function mockLayout() {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === 'scroller') return new DOMRect(0, -1000, 400, 3000);
    const idx = this.getAttribute('data-row-idx');
    if (idx !== null) return new DOMRect(0, Number(idx) * ROW_H, 400, ROW_H);
    return new DOMRect(0, 0, 0, 0);
  });
}

const at = (y: number) => ({ x: 100, y });
const hold = () => act(() => { vi.advanceTimersByTime(LIFT_MS); });
const row = (i: number) => screen.getByTestId(`row-${i}`);
const station = (i: number) => screen.getByText(`Station ${i}`);

describe('useTouchListReorder', () => {
  let layout: ReturnType<typeof mockLayout>;
  let scroller: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    layout = mockLayout();
    scroller = document.createElement('div');
    scroller.dataset.testid = 'scroller';
    document.body.appendChild(scroller);
  });

  afterEach(() => {
    layout.mockRestore();
    scroller.remove();
    vi.useRealTimers();
  });

  it('lifts a row whose body is a button and drops it, even though every render passes a new onDrop', () => {
    const onDrop = vi.fn();
    render(<Harness onDrop={onDrop} scroller={scroller} />);
    act(() => { dispatchTouch(station(3), 'touchstart', at(200)); });
    hold();
    expect(row(3)).toHaveClass('is-lifted');

    act(() => { dispatchTouch(station(3), 'touchmove', at(150)); });
    act(() => { dispatchTouch(station(3), 'touchmove', at(10)); });
    // The drop-target change re-rendered the harness with a new onDrop; the drag must survive it.
    expect(screen.getByTestId('target')).toHaveTextContent('0:before');
    expect(row(3)).toHaveClass('is-lifted');

    act(() => { dispatchTouch(station(3), 'touchend', at(10)); });
    expect(onDrop).toHaveBeenCalledWith(3, expect.objectContaining({ idx: 0, before: true, row: row(0) }), row(3));
  });

  it('keeps the row under the finger while the page scroller moves', () => {
    render(<Harness onDrop={vi.fn()} scroller={scroller} />);
    act(() => { dispatchTouch(station(1), 'touchstart', at(90)); });
    hold();
    act(() => { dispatchTouch(station(1), 'touchmove', at(120)); });
    scroller.scrollTop = 40;
    act(() => { dispatchTouch(station(1), 'touchmove', at(130)); });
    expect(row(1).style.getPropertyValue('--lift-dy')).toBe('80px');
  });

  it('touches on the ignored icon buttons keep their tap', () => {
    render(<Harness onDrop={vi.fn()} scroller={scroller} />);
    act(() => { dispatchTouch(screen.getByText('fav 2'), 'touchstart', at(150)); });
    hold();
    expect(row(2)).not.toHaveClass('is-lifted');
  });
});
