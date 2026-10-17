import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useTouchKeyboardAvoidance } from './useTouchKeyboardAvoidance';

function Page() {
  const ref = useRef<HTMLDivElement>(null);
  useTouchKeyboardAvoidance(ref);
  return (
    <div ref={ref} data-testid="page">
      <input aria-label="top" />
      <input aria-label="bottom" />
    </div>
  );
}

/** A phone 956 px tall whose keyboard leaves the upper 520 px visible. */
function mockKeyboardViewport() {
  const viewport = Object.assign(new EventTarget(), { height: 520, offsetTop: 0 });
  vi.stubGlobal('visualViewport', viewport);
  vi.stubGlobal('innerHeight', 956);
  return viewport;
}

function placeField(label: string, top: number) {
  const field = screen.getByRole('textbox', { name: label });
  field.getBoundingClientRect = () => ({ top, bottom: top + 48, left: 0, right: 0, width: 0, height: 48, x: 0, y: top, toJSON: () => ({}) });
  return field;
}

describe('touch keyboard avoidance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockKeyboardViewport();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('scrolls a field the keyboard would cover up into the visible part', () => {
    render(<Page />);
    const page = screen.getByTestId('page');
    page.scrollBy = vi.fn();
    fireEvent.focusIn(placeField('bottom', 700));
    vi.advanceTimersByTime(400);
    expect(page.scrollBy).toHaveBeenCalledWith({ top: 700 - 520 / 3, behavior: 'smooth' });
  });

  it('leaves a field alone that is already visible above the keyboard', () => {
    render(<Page />);
    const page = screen.getByTestId('page');
    page.scrollBy = vi.fn();
    fireEvent.focusIn(placeField('top', 200));
    vi.advanceTimersByTime(400);
    expect(page.scrollBy).not.toHaveBeenCalled();
  });

  it('pads the page by the keyboard height so the last field can scroll up', () => {
    render(<Page />);
    expect(screen.getByTestId('page').style.getPropertyValue('--keyboard-inset')).toBe('436px');
  });
});
