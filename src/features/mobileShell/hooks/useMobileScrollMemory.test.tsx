import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { APP_MAIN_SCROLL_VIEWPORT_ID } from '@/constants/appScroll';

const restore = vi.hoisted(() => vi.fn(() => () => {}));
vi.mock('@/lib/navigation/restoreMainViewportScroll', () => ({ restoreMainViewportScroll: restore }));

import { _resetMobileScrollMemoryForTest, useMobileScrollMemory } from './useMobileScrollMemory';

let navigate: ReturnType<typeof useNavigate>;

function Probe() {
  useMobileScrollMemory();
  navigate = useNavigate();
  return null;
}

function scrollViewport(el: HTMLElement, top: number) {
  Object.defineProperty(el, 'scrollTop', { configurable: true, value: top });
  el.dispatchEvent(new Event('scroll'));
}

const flushFrame = () => act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));

describe('useMobileScrollMemory', () => {
  let viewport: HTMLElement;

  beforeEach(() => {
    _resetMobileScrollMemoryForTest();
    restore.mockClear();
    viewport = document.createElement('div');
    viewport.id = APP_MAIN_SCROLL_VIEWPORT_ID;
    document.body.appendChild(viewport);
  });

  afterEach(() => viewport.remove());

  it('going back restores where the artist page was scrolled', async () => {
    render(<MemoryRouter initialEntries={['/artist/a1']}><Probe /></MemoryRouter>);
    scrollViewport(viewport, 840);
    act(() => { void navigate('/album/al1'); });
    scrollViewport(viewport, 0);
    await flushFrame();
    expect(restore).not.toHaveBeenCalled();

    act(() => { void navigate(-1); });
    await flushFrame();
    expect(restore).toHaveBeenCalledWith(840, expect.any(Function));
  });

  it('a new page opens at the top, and a page left at the top is not restored', async () => {
    render(<MemoryRouter initialEntries={['/artist/a1']}><Probe /></MemoryRouter>);
    act(() => { void navigate('/album/al1'); });
    await flushFrame();
    act(() => { void navigate(-1); });
    await flushFrame();
    expect(restore).not.toHaveBeenCalled();
  });
});
