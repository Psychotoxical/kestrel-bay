import { beforeEach, describe, expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeTrack, seedQueue } from '@/test/helpers/factories';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { swipe } from '@/test/helpers/touch';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { setTransitionMode } from '@/features/playback/utils/playback/playbackTransition';
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

  it('offers the crossfade length only while crossfade is on', () => {
    const { container } = renderPlayer();
    expect(container.querySelector('.mobile-crossfade-length')).toBeNull();
    act(() => { setTransitionMode('crossfade'); });
    expect(container.querySelector('.mobile-crossfade-length')).not.toBeNull();
  });
});
