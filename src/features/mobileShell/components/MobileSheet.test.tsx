import { beforeAll, describe, expect, it, vi } from 'vitest';
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

  it('is a named dialog', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Queue' })).toBeInTheDocument();
  });

  it('dragging the header far enough down closes it', () => {
    const { onClose, header } = setup();
    drag(header, 100, 260);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a short drag springs back', () => {
    const { onClose, header } = setup();
    drag(header, 100, 160);
    expect(onClose).not.toHaveBeenCalled();
    expect((document.querySelector('.mobile-sheet') as HTMLElement).style.transform).toBe('');
  });

  it('closes on backdrop tap, close button and Escape, not on taps inside', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByText('inside'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.mobile-sheet-backdrop') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
