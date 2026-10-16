import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { usePlayerStore } from '@/features/playback/store/playerStore';

const mocks = vi.hoisted(() => ({ getNowPlayingForServers: vi.fn() }));
vi.mock('@/lib/api/subsonicScrobble', () => ({ getNowPlayingForServers: mocks.getNowPlayingForServers }));
vi.mock('@/cover/CoverArtImage', () => ({ CoverArtImage: () => <div data-testid="cover" /> }));

import MobileLiveButton from './MobileLiveButton';

function entry(serverId: string, id: string, username: string, over: Record<string, unknown> = {}) {
  return {
    id, title: `Track ${id}`, artist: `Artist ${id}`, album: 'Album', albumId: `album-${id}`, coverArt: `c-${id}`,
    duration: 200, username, minutesAgo: 0, playerId: 1, playerName: 'Psysonic', serverId, ...over,
  };
}

function Location() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

async function renderButton() {
  renderWithProviders(<><MobileLiveButton /><Location /></>, { route: '/' });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const liveButton = () => screen.getByRole('button', { name: /Who is listening/ });

describe('MobileLiveButton', () => {
  beforeEach(() => {
    resetAllStores();
    mocks.getNowPlayingForServers.mockReset().mockResolvedValue([]);
    useAuthStore.setState({
      servers: [
        { id: 'a', name: 'Alpha', url: 'http://a.test', username: 'me', password: 'p' },
        { id: 'b', name: 'Beta', url: 'http://b.test', username: 'me', password: 'p' },
      ],
      activeServerId: 'a',
      libraryBrowseServerIds: ['a'],
      isLoggedIn: true,
    });
    usePlayerStore.setState({ isPlaying: false, queueItems: [], queueServerId: 'a', queueIndex: 0 });
  });

  it('nobody listening: a quiet button, and the sheet says so', async () => {
    await renderButton();
    expect(liveButton()).not.toHaveClass('mobile-live-btn--active');
    fireEvent.click(liveButton());
    await act(async () => { await Promise.resolve(); });
    expect(within(screen.getByRole('dialog', { name: 'Who is listening?' })).getByText('Nobody is currently listening.')).toBeInTheDocument();
  });

  it('someone listening: the button pulses and says how many', async () => {
    mocks.getNowPlayingForServers.mockResolvedValue([entry('a', '1', 'friend', { state: 'playing', positionMs: 1000 })]);
    await renderButton();
    expect(liveButton()).toHaveClass('mobile-live-btn--active');
    expect(liveButton()).toHaveAccessibleName('Who is listening? · 1');
  });

  it('your own stale entry does not count while you are not playing', async () => {
    mocks.getNowPlayingForServers.mockResolvedValue([entry('a', '1', 'me')]);
    await renderButton();
    expect(liveButton()).not.toHaveClass('mobile-live-btn--active');
  });

  it('the sheet lists who plays what; a row opens that album on its server', async () => {
    mocks.getNowPlayingForServers.mockResolvedValue([
      entry('a', '1', 'friend', { state: 'paused', positionMs: 30_000 }),
      entry('a', '2', 'other'),
    ]);
    await renderButton();
    fireEvent.click(liveButton());
    await act(async () => { await Promise.resolve(); });
    const sheet = screen.getByRole('dialog', { name: 'Who is listening?' });
    expect(within(sheet).getByText('friend (Psysonic)')).toBeInTheDocument();
    expect(within(sheet).getByText('0:30 / 3:20')).toBeInTheDocument();
    expect(within(sheet).getByRole('img', { name: 'Paused' })).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole('button', { name: /Track 2/ }));
    expect(screen.queryByRole('dialog', { name: 'Who is listening?' })).toBeNull();
    expect(screen.getByTestId('location')).toHaveTextContent('/album/album-2');
  });

  it('several servers in the scope: one heading per server', async () => {
    useAuthStore.setState({ libraryBrowseServerIds: ['a', 'b'] });
    mocks.getNowPlayingForServers.mockResolvedValue([entry('a', '1', 'friend'), entry('b', '2', 'other')]);
    await renderButton();
    fireEvent.click(liveButton());
    await act(async () => { await Promise.resolve(); });
    const sheet = screen.getByRole('dialog', { name: 'Who is listening?' });
    expect(within(sheet).getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(within(sheet).getByRole('heading', { name: 'Beta' })).toBeInTheDocument();
  });
});
