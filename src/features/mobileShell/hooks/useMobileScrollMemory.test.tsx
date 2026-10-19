import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { APP_MAIN_SCROLL_VIEWPORT_ID } from '@/constants/appScroll';

const restore = vi.hoisted(() => vi.fn(() => () => {}));
vi.mock('@/lib/navigation/restoreMainViewportScroll', () => ({ restoreMainViewportScroll: restore }));

import { _resetMobileScrollMemoryForTest, useMobileScrollMemory } from './useMobileScrollMemory';

const nav: { go: ReturnType<typeof useNavigate> | null } = { go: null };
const navigate = (to: string | number) => { void (nav.go as (t: string | number) => unknown)(to); };

function Probe({ onNavigate }: { onNavigate: (go: ReturnType<typeof useNavigate>) => void }) {
  useMobileScrollMemory();
  const go = useNavigate();
  useEffect(() => onNavigate(go), [go, onNavigate]);
  return null;
}

const keepNavigate = (go: ReturnType<typeof useNavigate>) => { nav.go = go; };

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
    render(<MemoryRouter initialEntries={['/artist/a1']}><Probe onNavigate={keepNavigate} /></MemoryRouter>);
    scrollViewport(viewport, 840);
    act(() => { navigate('/album/al1'); });
    scrollViewport(viewport, 0);
    await flushFrame();
    expect(restore).not.toHaveBeenCalled();

    act(() => { navigate(-1); });
    await flushFrame();
    expect(restore).toHaveBeenCalledWith(840, expect.any(Function));
  });

  it('a new page opens at the top, and a page left at the top is not restored', async () => {
    render(<MemoryRouter initialEntries={['/artist/a1']}><Probe onNavigate={keepNavigate} /></MemoryRouter>);
    act(() => { navigate('/album/al1'); });
    await flushFrame();
    act(() => { navigate(-1); });
    await flushFrame();
    expect(restore).not.toHaveBeenCalled();
  });
});
