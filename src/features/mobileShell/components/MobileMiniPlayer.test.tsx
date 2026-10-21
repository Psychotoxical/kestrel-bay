import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeTrack, seedQueue } from '@/test/helpers/factories';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { swipe } from '@/test/helpers/touch';
import { useOrbitStore } from '@/features/orbit';
import { usePlayerStore } from '@/features/playback';
import MobileMiniPlayer from './MobileMiniPlayer';

function Location() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderMini() {
  return renderWithProviders(<><MobileMiniPlayer /><Location /></>, { route: '/' });
}

describe('MobileMiniPlayer', () => {
  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
  });

  it('shows the station logo for a radio station that has one, the radio icon otherwise', () => {
    usePlayerStore.setState({ currentRadio: { id: 'r1', name: 'SmoothJazz', streamUrl: 'https://x', coverArt: 'ra-r1', serverId: 'srv' } });
    const { container, unmount } = renderMini();
    expect(container.querySelector('.mobile-miniplayer__cover svg.lucide-radio')).toBeNull();
    unmount();
    usePlayerStore.setState({ currentRadio: { id: 'r2', name: '1fm', streamUrl: 'https://y' } });
    const second = renderMini();
    expect(second.container.querySelector('.mobile-miniplayer__cover svg.lucide-radio')).not.toBeNull();
  });

  it('renders nothing while nothing plays', () => {
    const { container } = renderMini();
    expect(container.querySelector('.mobile-miniplayer')).toBeNull();
  });

  it('shows the current track and opens the player on tap', () => {
    const track = makeTrack({ title: 'Chaos', artist: 'Stormwind' });
    seedQueue([track]);
    renderMini();
    expect(screen.getByText('Chaos')).toBeInTheDocument();
    expect(screen.getByText('Stormwind')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Chaos/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/now-playing');
  });

  it('VoiceOver hears German in a German app: no "Now Playing" or "Play"', () => {
    seedQueue([makeTrack({ title: 'Chaos' })]);
    renderWithProviders(<MobileMiniPlayer />, { route: '/', language: 'de' });
    expect(screen.getByRole('button', { name: 'Läuft gerade: Chaos' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abspielen' })).toBeInTheDocument();
  });

  it('swiping it up opens the player', () => {
    seedQueue([makeTrack({ title: 'Chaos' })]);
    const { container } = renderMini();
    const bar = container.querySelector('.mobile-miniplayer') as HTMLElement;
    act(() => { swipe(bar, { x: 200, y: 830 }, { x: 205, y: 700 }); });
    expect(screen.getByTestId('location')).toHaveTextContent('/now-playing');
  });

  it('a sideways swipe does not open the player', () => {
    seedQueue([makeTrack({ title: 'Chaos' })]);
    const { container } = renderMini();
    const bar = container.querySelector('.mobile-miniplayer') as HTMLElement;
    act(() => { swipe(bar, { x: 100, y: 830 }, { x: 300, y: 810 }); });
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('an Orbit guest gets no Next button (the host skips); the host keeps it', () => {
    seedQueue([makeTrack({ title: 'Chaos' })]);
    useOrbitStore.setState({ role: 'guest', phase: 'active' });
    const { unmount } = renderMini();
    expect(screen.queryByRole('button', { name: 'Next Track' })).toBeNull();
    unmount();
    useOrbitStore.setState({ role: 'host', phase: 'active' });
    renderMini();
    expect(screen.getByRole('button', { name: 'Next Track' })).toBeInTheDocument();
  });
});
