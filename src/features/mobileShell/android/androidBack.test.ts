import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/util/platform', () => ({ IS_ANDROID: true }));

import { closeTopOverlay, installAndroidBack, topOverlay } from './androidBack';

const add = (html: string) => {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  document.body.appendChild(holder);
  return holder;
};

describe('androidBack', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    delete window.PsysonicAndroidShell;
  });

  it('finds no overlay on a plain page, and the back key is left to the page', () => {
    add('<main><p>page</p></main>');
    expect(topOverlay()).toBeNull();
    expect(closeTopOverlay()).toBe(false);
  });

  it('sends Escape to the overlay opened last', () => {
    add('<div class="mobile-sheet" id="sheet"></div>');
    add('<div class="context-menu" id="menu"></div>');
    const seen: string[] = [];
    document.getElementById('sheet')!.addEventListener('keydown', e => seen.push(`sheet:${e.key}`));
    document.getElementById('menu')!.addEventListener('keydown', e => seen.push(`menu:${e.key}`));
    expect(closeTopOverlay()).toBe(true);
    expect(seen).toEqual(['menu:Escape']);
  });

  it('sends Escape through the focused field, so it reaches the overlay and the document', () => {
    add('<div class="mobile-search-overlay" id="search"><input id="q" /></div>');
    const input = document.getElementById('q') as HTMLInputElement;
    input.focus();
    const seen: string[] = [];
    document.getElementById('search')!.addEventListener('keydown', e => seen.push(`overlay:${(e.target as HTMLElement).id}`));
    document.addEventListener('keydown', () => seen.push('document'), { once: true });
    closeTopOverlay();
    expect(seen).toEqual(['overlay:q', 'document']);
  });

  it('tells the activity when an overlay opens and closes', async () => {
    const setOverlayOpen = vi.fn();
    window.PsysonicAndroidShell = { setDarkBackground: vi.fn(), setOverlayOpen };
    const stop = installAndroidBack();
    const frame = () => new Promise(resolve => requestAnimationFrame(resolve));

    const sheet = add('<div class="mobile-sheet"></div>');
    await Promise.resolve();
    await frame();
    expect(setOverlayOpen).toHaveBeenLastCalledWith(true);

    sheet.remove();
    await Promise.resolve();
    await frame();
    expect(setOverlayOpen).toHaveBeenLastCalledWith(false);
    expect(setOverlayOpen).toHaveBeenCalledTimes(2);

    expect(typeof window.__psyAndroidBack).toBe('function');
    stop();
    expect(window.__psyAndroidBack).toBeUndefined();
  });
});
