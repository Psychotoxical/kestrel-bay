import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router';
import { APP_MAIN_SCROLL_VIEWPORT_ID } from '@/constants/appScroll';
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

const flushFrame = () => act(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));

/** A page scroller whose content height the test controls. */
function makeViewport() {
  const el = document.createElement('div');
  el.id = APP_MAIN_SCROLL_VIEWPORT_ID;
  const box = { contentHeight: 3000, top: 0 };
  Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => box.top, set: (v: number) => { box.top = v; } });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => 600 });
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => box.contentHeight });
  document.body.appendChild(el);
  const scrollTo = (top: number) => {
    el.scrollTop = top;
    el.dispatchEvent(new Event('scroll'));
  };
  return { el, box, scrollTo };
}

describe('useMobileScrollMemory', () => {
  let viewport: ReturnType<typeof makeViewport>;

  beforeEach(() => {
    _resetMobileScrollMemoryForTest();
    viewport = makeViewport();
  });

  afterEach(() => viewport.el.remove());

  it('going back restores the artist page once it has grown tall enough again', async () => {
    render(<MemoryRouter initialEntries={['/artist/a1']}><Probe onNavigate={keepNavigate} /></MemoryRouter>);
    viewport.scrollTo(840);

    act(() => { navigate('/album/al1'); });
    // The album page starts short and clamps the offset; that belongs to the album entry.
    viewport.box.contentHeight = 700;
    viewport.scrollTo(100);
    await flushFrame();

    act(() => { navigate(-1); });
    viewport.box.contentHeight = 700;
    viewport.el.scrollTop = 0;
    await flushFrame();
    await flushFrame();
    expect(viewport.el.scrollTop).toBe(0);

    viewport.box.contentHeight = 3000;
    await flushFrame();
    expect(viewport.el.scrollTop).toBe(840);
  });

  it('a touch while the page is still loading cancels the restore', async () => {
    render(<MemoryRouter initialEntries={['/artist/a1']}><Probe onNavigate={keepNavigate} /></MemoryRouter>);
    viewport.scrollTo(840);
    act(() => { navigate('/album/al1'); });
    await flushFrame();

    act(() => { navigate(-1); });
    viewport.box.contentHeight = 700;
    viewport.el.scrollTop = 0;
    await flushFrame();
    document.dispatchEvent(new Event('touchstart'));
    viewport.box.contentHeight = 3000;
    await flushFrame();
    await flushFrame();
    expect(viewport.el.scrollTop).toBe(0);
  });

  it('a new page opens at the top, and a page left at the top is not restored', async () => {
    render(<MemoryRouter initialEntries={['/artist/a1']}><Probe onNavigate={keepNavigate} /></MemoryRouter>);
    act(() => { navigate('/album/al1'); });
    viewport.scrollTo(500);
    await flushFrame();

    act(() => { navigate(-1); });
    viewport.el.scrollTop = 0;
    await flushFrame();
    await flushFrame();
    expect(viewport.el.scrollTop).toBe(0);
  });
});
