import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router';
import { swipe } from '@/test/helpers/touch';
import MobileSwipeNavigation from './MobileSwipeNavigation';

const navigateRef: { current: NavigateFunction | null } = { current: null };

function Page() {
  const navigate = useNavigate();
  useEffect(() => { navigateRef.current = navigate; });
  const { pathname } = useLocation();
  return (
    <div className="app-shell" data-mobile-app="">
      <main className="main-content">
        <div className="main-content-zoom">
          <div data-testid="page">{pathname}</div>
          <div className="album-grid" data-testid="rail">rail</div>
        </div>
      </main>
    </div>
  );
}

function renderAt(path: string) {
  window.history.replaceState(null, '', path);
  return render(
    <BrowserRouter>
      <Page />
      <MobileSwipeNavigation />
    </BrowserRouter>,
  );
}

const go = (to: string) => act(() => { navigateRef.current?.(to); });
const page = () => screen.getByTestId('page');

describe('MobileSwipeNavigation', () => {
  beforeEach(() => { navigateRef.current = null; });
  afterEach(() => { window.history.replaceState(null, '', '/'); });

  it('swipe right goes one step back, swipe left goes forward again', async () => {
    renderAt('/library');
    go('/albums');
    go('/album/1');
    expect(page()).toHaveTextContent('/album/1');

    swipe(page(), { x: 40, y: 400 }, { x: 260, y: 405 });
    await waitFor(() => expect(page()).toHaveTextContent('/albums'));

    swipe(page(), { x: 300, y: 400 }, { x: 60, y: 405 });
    await waitFor(() => expect(page()).toHaveTextContent('/album/1'));
  });

  it('a short swipe springs back and stays on the page', async () => {
    renderAt('/library');
    go('/albums');
    swipe(page(), { x: 40, y: 400 }, { x: 100, y: 402 });
    await new Promise(r => setTimeout(r, 300));
    expect(page()).toHaveTextContent('/albums');
    const zoom = document.querySelector<HTMLElement>('.main-content-zoom');
    expect(zoom?.style.transform).toBe('');
  });

  it('ignores mostly vertical movement (scrolling)', async () => {
    renderAt('/library');
    go('/albums');
    swipe(page(), { x: 40, y: 200 }, { x: 160, y: 600 });
    await new Promise(r => setTimeout(r, 300));
    expect(page()).toHaveTextContent('/albums');
  });

  it('leaves horizontal swipes on rails to the rail', async () => {
    renderAt('/library');
    go('/albums');
    swipe(screen.getByTestId('rail'), { x: 40, y: 400 }, { x: 300, y: 405 });
    await new Promise(r => setTimeout(r, 300));
    expect(page()).toHaveTextContent('/albums');
  });

  it('has nothing to go forward to after a fresh navigation', async () => {
    renderAt('/library');
    go('/albums');
    swipe(page(), { x: 300, y: 400 }, { x: 40, y: 405 });
    await new Promise(r => setTimeout(r, 300));
    expect(page()).toHaveTextContent('/albums');
  });
});
