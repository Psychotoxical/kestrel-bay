import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import MobileSheet from './MobileSheet';

function setup() {
  const onClose = vi.fn();
  renderWithProviders(
    <MobileSheet title="Queue" onClose={onClose}>
      <button type="button">inside</button>
    </MobileSheet>,
  );
  const header = document.querySelector('.mobile-sheet__header') as HTMLElement;
  return { onClose, header };
}

function drag(header: HTMLElement, fromY: number, toY: number) {
  act(() => {
    fireEvent.pointerDown(header, { clientY: fromY, pointerId: 1 });
    for (let y = fromY; y <= toY; y += 20) fireEvent.pointerMove(header, { clientY: y, pointerId: 1 });
    fireEvent.pointerMove(header, { clientY: toY, pointerId: 1 });
    fireEvent.pointerUp(header, { clientY: toY, pointerId: 1 });
  });
}

describe('MobileSheet', () => {
  beforeAll(() => {
    // jsdom has no pointer capture.
    Element.prototype.setPointerCapture ??= () => {};
  });
  // The sheet slides out before it reports the close.
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });
  const slideOut = () => act(() => { vi.advanceTimersByTime(300); });

  it('is a named dialog', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Queue' })).toBeInTheDocument();
  });

  it('dragging the header far enough down closes it', () => {
    const { onClose, header } = setup();
    drag(header, 100, 260);
    expect(onClose).not.toHaveBeenCalled();
    expect((document.querySelector('.mobile-sheet') as HTMLElement).style.transform).toBe('translateY(100%)');
    slideOut();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a short drag springs back', () => {
    const { onClose, header } = setup();
    drag(header, 100, 160);
    expect(onClose).not.toHaveBeenCalled();
    expect((document.querySelector('.mobile-sheet') as HTMLElement).style.transform).toBe('');
  });

  it('follows the finger while dragged', () => {
    const { header } = setup();
    act(() => {
      fireEvent.pointerDown(header, { clientY: 100, pointerId: 1 });
      fireEvent.pointerMove(header, { clientY: 160, pointerId: 1 });
    });
    expect((document.querySelector('.mobile-sheet') as HTMLElement).style.transform).toBe('translateY(60px)');
  });

  it('closes on backdrop tap, close button and Escape, once, not on taps inside', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText('inside'));
    slideOut();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.mobile-sheet-backdrop') as HTMLElement);
    slideOut();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the close button', () => fireEvent.click(screen.getByRole('button', { name: 'Close' }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
  ])('closes on %s after sliding out', (_name, close) => {
    const { onClose } = setup();
    close();
    expect(onClose).not.toHaveBeenCalled();
    slideOut();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('pulling the scrolled-to-top content down drags the sheet', () => {
    const { onClose } = setup();
    const body = document.querySelector('.mobile-sheet__body') as HTMLElement;
    const touch = (y: number) => ({ touches: [{ clientY: y }] });
    act(() => {
      fireEvent.touchStart(body, touch(100));
      fireEvent.touchMove(body, touch(150));
      fireEvent.touchMove(body, touch(210));
    });
    // The drag starts where the pull began, so the sheet sits 60 px lower.
    expect((document.querySelector('.mobile-sheet') as HTMLElement).style.transform).toBe('translateY(60px)');
    act(() => {
      fireEvent.touchMove(body, touch(300));
      fireEvent.touchEnd(body);
    });
    slideOut();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
