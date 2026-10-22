import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import {
  resetPlaylistsLibraryScopeCountsCacheForTests,
  usePlaylistsLibraryScopeCounts,
} from './usePlaylistsLibraryScopeCounts';

const getPlaylistForServerMock = vi.hoisted(() => vi.fn());
const librarySelectionMock = vi.hoisted(() => vi.fn((_serverId: string): string[] => []));

vi.mock('@/lib/api/subsonicPlaylists', () => ({
  getPlaylistForServer: getPlaylistForServerMock,
}));

vi.mock('@/lib/api/subsonicLibrary', () => ({
  filterSongsToServerLibrary: (songs: unknown[]) => Promise.resolve(songs),
}));

vi.mock('@/lib/api/subsonicClient', () => ({
  librarySelectionForServer: librarySelectionMock,
}));

vi.mock('@/lib/library/luckyMixScopeOverride', () => ({
  getLuckyMixLibraryScopeOverride: () => null,
}));

vi.mock('@/features/offline', () => ({
  useOfflineBrowseContext: () => ({ active: false }),
}));

const playlist = (overrides: Partial<SubsonicPlaylist>): SubsonicPlaylist => ({
  id: 'same', serverId: 'a', name: 'A', songCount: 1, duration: 10, created: '', changed: 'c1', ...overrides,
});

beforeEach(() => {
  resetPlaylistsLibraryScopeCountsCacheForTests();
  getPlaylistForServerMock.mockReset();
  librarySelectionMock.mockReset();
  librarySelectionMock.mockReturnValue([]);
});

describe('usePlaylistsLibraryScopeCounts', () => {
  it('fetches nothing without a library selection (the cards keep the server counts)', async () => {
    // Lists live outside the render callback: the page keeps them in state, and a
    // new array per render would restart the effect forever.
    const list = [playlist({})];
    const { result } = renderHook(() => usePlaylistsLibraryScopeCounts(list, 0));
    await waitFor(() => expect(result.current.filteredSongCountByPlaylist).toEqual({}));
    expect(getPlaylistForServerMock).not.toHaveBeenCalled();
  });

  it('keeps matching playlist ids distinct across servers', async () => {
    librarySelectionMock.mockReturnValue(['lib1']);
    getPlaylistForServerMock.mockImplementation(async (serverId: string) => ({
      playlist: { id: 'same' },
      songs: serverId === 'a'
        ? [{ id: 'a1', duration: 10 }]
        : [{ id: 'b1', duration: 20 }, { id: 'b2', duration: 30 }],
    }));

    const list = [
      playlist({ serverId: 'a' }),
      playlist({ serverId: 'b', name: 'B', songCount: 2, duration: 50 }),
    ];
    const { result } = renderHook(() => usePlaylistsLibraryScopeCounts(list, 0));

    await waitFor(() => expect(result.current.filteredSongCountByPlaylist).toEqual({
      'a:same': 1,
      'b:same': 2,
    }));
    expect(result.current.filteredDurationByPlaylist).toEqual({
      'a:same': 10,
      'b:same': 50,
    });
  });

  it('fetches a scoped playlist once per revision', async () => {
    librarySelectionMock.mockReturnValue(['lib1']);
    getPlaylistForServerMock.mockResolvedValue({ playlist: { id: 'same' }, songs: [{ id: 's1', duration: 7 }] });

    const first = renderHook(({ list }) => usePlaylistsLibraryScopeCounts(list, 0), {
      initialProps: { list: [playlist({})] },
    });
    await waitFor(() => expect(first.result.current.filteredSongCountByPlaylist).toEqual({ 'a:same': 1 }));
    expect(getPlaylistForServerMock).toHaveBeenCalledTimes(1);

    // Same revision in a fresh list (page revisited, list refetched): no new request.
    first.rerender({ list: [playlist({})] });
    first.unmount();
    const secondList = [playlist({})];
    const second = renderHook(() => usePlaylistsLibraryScopeCounts(secondList, 0));
    await waitFor(() => expect(second.result.current.filteredSongCountByPlaylist).toEqual({ 'a:same': 1 }));
    expect(getPlaylistForServerMock).toHaveBeenCalledTimes(1);

    // Changed on the server: fetched again.
    getPlaylistForServerMock.mockResolvedValue({
      playlist: { id: 'same' },
      songs: [{ id: 's1', duration: 7 }, { id: 's2', duration: 3 }],
    });
    second.rerender();
    const thirdList = [playlist({ changed: 'c2', songCount: 2 })];
    const third = renderHook(() => usePlaylistsLibraryScopeCounts(thirdList, 0));
    await waitFor(() => expect(third.result.current.filteredSongCountByPlaylist).toEqual({ 'a:same': 2 }));
    expect(getPlaylistForServerMock).toHaveBeenCalledTimes(2);
  });
});
