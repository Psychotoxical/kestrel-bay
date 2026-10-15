import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { dispatchTouch } from '@/test/helpers/touch';
import MobileTouchContextMenu from './MobileTouchContextMenu';

function setup() {
  const onContextMenu = vi.fn((e: React.MouseEvent) => e.preventDefault());
  const onClick = vi.fn();
  render(
    <>
      <MobileTouchContextMenu />
      <button type="button" onContextMenu={onContextMenu} onClick={onClick}>row</button>
      <input aria-label="field" onContextMenu={onContextMenu} />
    </>,
  );
  return { onContextMenu, onClick, row: screen.getByText('row'), field: screen.getByLabelText('field') };
}

describe('MobileTouchContextMenu', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a long press opens the context menu at the finger', () => {
    const { onContextMenu, row } = setup();
    dispatchTouch(row, 'touchstart', { x: 30, y: 40 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    const event = onContextMenu.mock.calls[0][0];
    expect([event.clientX, event.clientY]).toEqual([30, 40]);
  });

  it('swallows the click that follows the long press', () => {
    const { onClick, row } = setup();
    dispatchTouch(row, 'touchstart', { x: 30, y: 40 });
    act(() => { vi.advanceTimersByTime(500); });
    dispatchTouch(row, 'touchend', { x: 30, y: 40 });
    fireEvent.click(row);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('a short tap stays a tap', () => {
    const { onContextMenu, onClick, row } = setup();
    dispatchTouch(row, 'touchstart', { x: 30, y: 40 });
    act(() => { vi.advanceTimersByTime(150); });
    dispatchTouch(row, 'touchend', { x: 30, y: 40 });
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.click(row);
    expect(onContextMenu).not.toHaveBeenCalled();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('moving the finger (scrolling) cancels the long press', () => {
    const { onContextMenu, row } = setup();
    dispatchTouch(row, 'touchstart', { x: 30, y: 40 });
    dispatchTouch(row, 'touchmove', { x: 30, y: 70 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it('leaves inputs alone', () => {
    const { onContextMenu, field } = setup();
    dispatchTouch(field, 'touchstart', { x: 30, y: 40 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(onContextMenu).not.toHaveBeenCalled();
  });

  it('the next tap after a long press is a normal click again', () => {
    const { onClick, row } = setup();
    dispatchTouch(row, 'touchstart', { x: 30, y: 40 });
    act(() => { vi.advanceTimersByTime(500); });
    dispatchTouch(row, 'touchend', { x: 30, y: 40 });
    // No click arrived after the long press; the next touch clears the swallow.
    dispatchTouch(row, 'touchstart', { x: 30, y: 40 });
    dispatchTouch(row, 'touchend', { x: 30, y: 40 });
    fireEvent.click(row);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
