import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { dispatchTouch, swipe } from '@/test/helpers/touch';
import { APP_MAIN_SCROLL_VIEWPORT_ID } from '@/constants/appScroll';
import { useHomeRefreshStore } from '@/features/home/store/homeRefreshStore';
import MobilePullToRefresh from './MobilePullToRefresh';

function setup() {
  renderWithProviders(
    <div id={APP_MAIN_SCROLL_VIEWPORT_ID} data-testid="viewport">
      <MobilePullToRefresh />
    </div>,
  );
  return screen.getByTestId('viewport');
}

describe('MobilePullToRefresh', () => {
  beforeEach(() => {
    useHomeRefreshStore.setState({ token: 0, refreshing: false });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('pulling past the threshold at the top asks for exactly one refresh', () => {
    const viewport = setup();
    act(() => { swipe(viewport, { x: 200, y: 100 }, { x: 200, y: 400 }); });
    expect(useHomeRefreshStore.getState()).toMatchObject({ token: 1, refreshing: true });
    expect(document.querySelector('.mobile-ptr')).toHaveClass('is-refreshing');
  });

  it('a short pull springs back without refreshing', () => {
    const viewport = setup();
    act(() => { swipe(viewport, { x: 200, y: 100 }, { x: 200, y: 160 }); });
    expect(useHomeRefreshStore.getState().token).toBe(0);
    expect((document.querySelector('.mobile-ptr') as HTMLElement).style.height).toBe('0px');
  });

  it('does nothing while the page is scrolled down', () => {
    const viewport = setup();
    viewport.scrollTop = 120;
    act(() => { swipe(viewport, { x: 200, y: 100 }, { x: 200, y: 400 }); });
    expect(useHomeRefreshStore.getState().token).toBe(0);
  });

  it('owns the downward drag at the top (no native bounce on top of the gap)', () => {
    const viewport = setup();
    act(() => {
      dispatchTouch(viewport, 'touchstart', { x: 200, y: 100 });
      const move = dispatchTouch(viewport, 'touchmove', { x: 200, y: 200 });
      expect(move.defaultPrevented).toBe(true);
      dispatchTouch(viewport, 'touchend', { x: 200, y: 200 });
    });
  });

  it('upward drags scroll normally', () => {
    const viewport = setup();
    act(() => {
      dispatchTouch(viewport, 'touchstart', { x: 200, y: 400 });
      const move = dispatchTouch(viewport, 'touchmove', { x: 200, y: 300 });
      expect(move.defaultPrevented).toBe(false);
      dispatchTouch(viewport, 'touchend', { x: 200, y: 300 });
    });
  });

  it('the spinner never hangs when no refresh result arrives', () => {
    vi.useFakeTimers();
    const viewport = setup();
    act(() => { swipe(viewport, { x: 200, y: 100 }, { x: 200, y: 400 }); });
    expect(useHomeRefreshStore.getState().refreshing).toBe(true);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(useHomeRefreshStore.getState().refreshing).toBe(false);
  });
});
