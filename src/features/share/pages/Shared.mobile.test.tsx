import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { open } from '@tauri-apps/plugin-shell';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { makeServer } from '@/test/helpers/factories';
import { resetAuthStore, resetPlayerStore } from '@/test/helpers/storeReset';
import { resetServerReachabilitySnapshot } from '@/lib/network/serverReachability';
import { useAuthStore } from '@/store/authStore';
import { useConfirmModalStore } from '@/store/confirmModalStore';
import type { SubsonicShare } from '@/lib/api/subsonicSharing';
import { _resetShareStoreForTest, useShareStore } from '@/features/share/store/shareStore';
import { _resetShareSettingsStoreForTest, useShareSettingsStore } from '@/features/share/store/shareSettingsStore';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import Shared from '@/features/share/pages/Shared';

const api = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('@/cover/AlbumCoverArtImage', () => ({
  AlbumCoverArtImage: ({ albumId }: { albumId: string }) => <span data-testid={`share-cover-${albumId}`} />,
}));
vi.mock('@/lib/dom/toast', () => ({ showToast: api.showToast }));

const originalConfirmRequest = useConfirmModalStore.getState().request;

const COLLECTION: SubsonicShare = {
  id: 'share-1',
  url: 'https://server.test/share/1',
  expires: '2027-10-16T15:35:00Z',
  visitCount: 3,
  username: 'stelle',
  entry: [
    { id: 'track-1', title: 'First track', artist: 'Band', album: 'Record', albumId: 'album-1', duration: 200 },
    { id: 'track-2', title: 'Second track', artist: 'Band', album: 'Record', albumId: 'album-1', duration: 180 },
  ],
};
const SINGLE: SubsonicShare = {
  id: 'share-2',
  url: 'https://server.test/share/2',
  entry: [{ id: 'track-3', title: 'Lonely track', artist: 'Solo', albumId: 'album-2', duration: 90 }],
};

function seed(deleteShare: (serverId: string, shareId: string) => Promise<void> = vi.fn(async () => {})) {
  useAuthStore.setState({ servers: [makeServer({ id: 'server-a', name: 'Home' })] });
  useShareStore.setState(state => ({
    ...state,
    refreshAll: vi.fn(async () => {}),
    deleteShare,
    byServer: {
      'server-a': {
        shares: [COLLECTION, SINGLE],
        loading: false,
        lastSuccessfulRefresh: 1,
        availability: 'available',
      },
    },
  }));
  return deleteShare;
}

beforeEach(() => {
  resetAuthStore();
  resetPlayerStore();
  _resetShareStoreForTest();
  _resetShareSettingsStoreForTest();
  useShareSettingsStore.getState().setNavidromeSharingEnabled(true);
  resetServerReachabilitySnapshot();
  useConfirmModalStore.setState({ request: vi.fn(async () => true) });
  vi.clearAllMocks();
});

afterAll(() => useConfirmModalStore.setState({ request: originalConfirmRequest }));

describe('Shared page (touch shell)', () => {
  it('lists links as rows instead of cards with button rows', () => {
    seed();
    renderWithProviders(<Shared />, { route: '/shared' });

    expect(screen.queryByRole('article')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Refresh all' })).toHaveClass('mobile-round-btn');

    const collection = screen.getByRole('button', { name: /^Collection/ });
    expect(collection).toHaveTextContent('2 items · Expires');
    expect(collection).toHaveTextContent('Visits: 3');
    // A single track is named by its title; its kind moves into the details.
    expect(screen.getByRole('button', { name: /^Lonely track/ })).toHaveTextContent('Track');
  });

  it('a row opens a sheet to play, copy, open externally and browse the contents', async () => {
    seed();
    const playTrack = vi.fn();
    usePlayerStore.setState({ playTrack });
    renderWithProviders(<Shared />, { route: '/shared' });

    fireEvent.click(screen.getByRole('button', { name: /^Collection/ }));
    const sheet = screen.getByRole('dialog', { name: 'Collection' });
    expect(within(sheet).getByText('stelle')).toBeInTheDocument();

    // Tapping a track plays the share from that track.
    fireEvent.click(await within(sheet).findByRole('button', { name: /Second track/ }));
    expect(playTrack).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'track-2' }),
      [expect.objectContaining({ id: 'track-1' }), expect.objectContaining({ id: 'track-2' })],
    );

    fireEvent.click(within(sheet).getByRole('button', { name: 'Play' }));
    expect(playTrack).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'track-1' }), expect.any(Array));

    fireEvent.click(within(sheet).getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(COLLECTION.url));

    fireEvent.click(within(sheet).getByRole('button', { name: 'Open externally' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith(COLLECTION.url));
  });

  it('deleting closes the sheet once the link is gone', async () => {
    const deleteShare = seed(vi.fn(async (serverId: string, shareId: string) => {
      useShareStore.setState(state => ({
        byServer: {
          ...state.byServer,
          [serverId]: { ...state.byServer[serverId]!, shares: state.byServer[serverId]!.shares.filter(s => s.id !== shareId) },
        },
      }));
    }));
    renderWithProviders(<Shared />, { route: '/shared' });

    fireEvent.click(screen.getByRole('button', { name: /^Lonely track/ }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Lonely track' })).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteShare).toHaveBeenCalledWith('server-a', 'share-2'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: /^Lonely track/ })).toBeNull();
  });

  it('a failed delete keeps the sheet open and says why', async () => {
    seed(vi.fn(async () => { throw new Error('delete failed'); }));
    renderWithProviders(<Shared />, { route: '/shared' });

    fireEvent.click(screen.getByRole('button', { name: /^Lonely track/ }));
    const sheet = screen.getByRole('dialog', { name: 'Lonely track' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete' }));

    expect(await within(sheet).findByRole('alert')).toHaveTextContent('delete failed');
    expect(screen.getByRole('dialog', { name: 'Lonely track' })).toBeInTheDocument();
  });
});
