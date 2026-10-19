import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeTrack, seedQueue } from '@/test/helpers/factories';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { swipe } from '@/test/helpers/touch';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { setTransitionMode } from '@/features/playback/utils/playback/playbackTransition';
import { useOrbitStore } from '@/features/orbit';
import MobilePlayer from './MobilePlayer';

function Location() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderPlayer() {
  return renderWithProviders(<><MobilePlayer /><Location /></>, { route: '/now-playing' });
}

describe('MobilePlayer', () => {
  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
    setTransitionMode('none');
    seedQueue([makeTrack({ title: 'Chaos', artist: 'Stormwind', duration: 200 })]);
  });

  it('swiping down closes the player', () => {
    const { container } = renderPlayer();
    const player = container.querySelector('.mobile-player') as HTMLElement;
    act(() => { swipe(player, { x: 200, y: 200 }, { x: 205, y: 450 }); });
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/$/);
  });

  it('an Orbit guest cannot skip and is told why; the host can', () => {
    useOrbitStore.setState({ role: 'guest', phase: 'active' });
    const { unmount } = renderPlayer();
    for (const name of ['Previous Track', 'Next Track']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.title).toMatch(/Orbit host/);
    }
    unmount();
    useOrbitStore.setState({ role: 'host', phase: 'active' });
    renderPlayer();
    for (const name of ['Previous Track', 'Next Track']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      expect(button.title).toBe('');
    }
  });

  it('favourite, lyrics, queue and more are icon-only buttons in the bottom row, in that order', () => {
    const { container } = renderPlayer();
    const footer = container.querySelector('.mobile-player__footer') as HTMLElement;
    const meta = container.querySelector('.mobile-player__meta') as HTMLElement;
    const buttons = within(footer).getAllByRole('button');
    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual(['Favorite', 'Lyrics', 'Queue', 'More options']);
    for (const button of buttons) expect(button.textContent).toBe('');
    expect(within(meta).queryByRole('button')).toBeNull();
    expect(within(meta).getByText('Chaos')).toBeInTheDocument();
  });

  it('the more button opens the song menu and a second tap closes it again', () => {
    renderPlayer();
    const more = screen.getByRole('button', { name: 'More options' });
    fireEvent.pointerDown(more);
    fireEvent.click(more);
    expect(usePlayerStore.getState().contextMenu.isOpen).toBe(true);
    // The real menu closes on mousedown; that happens between pointerdown and click.
    fireEvent.pointerDown(more);
    act(() => { usePlayerStore.getState().closeContextMenu(); });
    fireEvent.click(more);
    expect(usePlayerStore.getState().contextMenu.isOpen).toBe(false);
  });

  it('names the close button for VoiceOver with a real translation, not a raw key', () => {
    renderPlayer();
    expect(screen.getByRole('button', { name: 'Back' })).toHaveClass('mobile-player__close');
    expect(screen.queryByRole('button', { name: /^player\./ })).toBeNull();
  });

  it('a short swipe down keeps it open', () => {
    const { container } = renderPlayer();
    const player = container.querySelector('.mobile-player') as HTMLElement;
    act(() => { swipe(player, { x: 200, y: 200 }, { x: 202, y: 260 }); });
    expect(screen.getByTestId('location')).toHaveTextContent('/now-playing');
    expect(player.style.transform).toBe('');
  });

  it('dragging on the seek bar seeks instead of closing', () => {
    renderPlayer();
    const bar = screen.getByRole('slider', { name: 'Position in track' });
    act(() => { swipe(bar, { x: 200, y: 600 }, { x: 205, y: 850 }); });
    expect(screen.getByTestId('location')).toHaveTextContent('/now-playing');
  });

  it('shows the plain bar until the waveform is analysed, then the waveform', () => {
    const { container } = renderPlayer();
    expect(container.querySelector('.mobile-player__seek-slot > .mobile-player__bar')).not.toBeNull();
    expect(container.querySelector('.mobile-player__waveform canvas')).toBeNull();
    act(() => { usePlayerStore.setState({ waveformBins: [0.2, 0.5, 0.8, 0.4] }); });
    expect(container.querySelector('.mobile-player__waveform canvas')).not.toBeNull();
    expect(container.querySelector('.mobile-player__bar')).toBeNull();
    // Both live in the same fixed-height slot, so the cover keeps its size.
    expect(container.querySelector('.mobile-player__seek-slot > .mobile-player__waveform')).not.toBeNull();
  });

  it('the arrow under the transport opens the options sheet; the transitions are no longer on the player', () => {
    const { container } = renderPlayer();
    expect(container.querySelector('.mobile-player .mobile-transition-bar, .mobile-player .mobile-chips')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Audio' }));
    const sheet = screen.getByRole('dialog', { name: 'Audio' });
    expect(within(sheet).getByRole('heading', { name: 'Track transitions' })).toBeInTheDocument();
    expect(within(sheet).getByRole('radiogroup', { name: 'Normalization' })).toBeInTheDocument();
  });

  it('offers the crossfade length only while crossfade is on', () => {
    renderPlayer();
    fireEvent.click(screen.getByRole('button', { name: 'Audio' }));
    expect(document.querySelector('.mobile-sheet--audio .mobile-crossfade-length')).toBeNull();
    act(() => { setTransitionMode('crossfade'); });
    expect(document.querySelector('.mobile-sheet--audio .mobile-crossfade-length')).not.toBeNull();
  });
});
