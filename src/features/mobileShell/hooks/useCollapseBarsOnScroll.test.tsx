import { afterEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { MOBILE_BARS_ATTR, barsFolded, unfoldBars, useCollapseBarsOnScroll } from '@/features/mobileShell/hooks/useCollapseBarsOnScroll';

function Harness() {
  useCollapseBarsOnScroll();
  return (
    <div className="app-shell-route-host">
      <div data-testid="page" />
    </div>
  );
}

function renderHarness() {
  const view = render(<MemoryRouter><Harness /></MemoryRouter>);
  return { ...view, page: view.getByTestId('page') };
}

/** jsdom has no layout: set `scrollTop` by hand and fire the scroll event. */
function scrollTo(el: HTMLElement, top: number) {
  Object.defineProperty(el, 'scrollTop', { configurable: true, writable: true, value: top });
  act(() => { el.dispatchEvent(new Event('scroll')); });
}

const folded = () => document.documentElement.getAttribute(MOBILE_BARS_ATTR) === 'collapsed';

describe('useCollapseBarsOnScroll', () => {
  afterEach(() => document.documentElement.removeAttribute(MOBILE_BARS_ATTR));

  it('folds while the page scrolls down and stays folded on the way back up', () => {
    const { page } = renderHarness();
    scrollTo(page, 100);
    scrollTo(page, 200);
    expect(folded()).toBe(true);

    // Moving up further down the page leaves the bars folded, however far.
    scrollTo(page, 192);
    scrollTo(page, 80);
    expect(folded()).toBe(true);
    // Down again after a move up folds as before.
    scrollTo(page, 300);
    expect(folded()).toBe(true);
  });

  it('unfolds on a tap on the folded tab button', () => {
    const { page } = renderHarness();
    scrollTo(page, 100);
    scrollTo(page, 200);
    expect(barsFolded()).toBe(true);
    act(() => unfoldBars());
    expect(folded()).toBe(false);
  });

  it('unfolds at the top of the page', () => {
    const { page } = renderHarness();
    scrollTo(page, 300);
    scrollTo(page, 600);
    expect(folded()).toBe(true);
    scrollTo(page, 40);
    expect(folded()).toBe(false);
  });

  it('ignores sideways rails, whose scrollTop does not change', () => {
    const { page } = renderHarness();
    scrollTo(page, 0);
    scrollTo(page, 0);
    scrollTo(page, 0);
    expect(folded()).toBe(false);
  });

  it('ignores scrollers outside the page, such as sheets', () => {
    renderHarness();
    const sheet = document.createElement('div');
    document.body.appendChild(sheet);
    scrollTo(sheet, 100);
    scrollTo(sheet, 400);
    expect(folded()).toBe(false);
    sheet.remove();
  });

  it('unfolds when the bars leave the screen', () => {
    const { page, unmount } = renderHarness();
    scrollTo(page, 100);
    scrollTo(page, 300);
    expect(folded()).toBe(true);
    unmount();
    expect(folded()).toBe(false);
  });
});
