import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { emit } from '@tauri-apps/api/event';
import { emitTauriEvent, tauriMockListenerCount } from '@/test/mocks/tauri';
import { useCarPlayBridge } from './useCarPlayBridge';

const content = vi.hoisted(() => ({
  carPlayList: vi.fn(async (node: string) => ({ sections: [{ items: [{ node: `${node}-row`, title: 'Row', browse: false }] }] })),
  carPlayPlay: vi.fn(async () => {}),
  carPlayCommand: vi.fn(),
  carPlayState: vi.fn(() => ({ shuffle: false, repeat: 'off', starred: false, hasTrack: true, upNextTitle: 'Up next', albumTitle: 'Record' })),
}));
vi.mock('@/features/mobileShell/car/carplayContent', () => content);

const emitMock = vi.mocked(emit);

describe('useCarPlayBridge', () => {
  beforeEach(() => {
    emitMock.mockClear();
    content.carPlayList.mockClear();
    content.carPlayPlay.mockClear();
    content.carPlayCommand.mockClear();
  });

  it('reports ready once listening, so waiting native requests are sent again', async () => {
    const { unmount } = renderHook(() => useCarPlayBridge());
    await waitFor(() => expect(emitMock).toHaveBeenCalledWith('carplay:ready'));
    expect(tauriMockListenerCount('carplay:list')).toBe(1);
    expect(tauriMockListenerCount('carplay:play')).toBe(1);
    unmount();
  });

  it('answers a list request with the request id and the content', async () => {
    const { unmount } = renderHook(() => useCarPlayBridge());
    await waitFor(() => expect(emitMock).toHaveBeenCalledWith('carplay:ready'));
    await act(async () => { emitTauriEvent('carplay:list', { requestId: 7, node: 'home' }); });
    await waitFor(() => expect(emitMock).toHaveBeenCalledWith('carplay:list-result', {
      requestId: 7,
      sections: [{ items: [{ node: 'home-row', title: 'Row', browse: false }] }],
    }));
    unmount();
  });

  it('a failing list still answers, with an empty list', async () => {
    content.carPlayList.mockRejectedValueOnce(new Error('offline'));
    const { unmount } = renderHook(() => useCarPlayBridge());
    await waitFor(() => expect(emitMock).toHaveBeenCalledWith('carplay:ready'));
    await act(async () => { emitTauriEvent('carplay:list', { requestId: 3, node: 'albums' }); });
    await waitFor(() => expect(emitMock).toHaveBeenCalledWith('carplay:list-result', { requestId: 3, sections: [] }));
    unmount();
  });

  it('sends covers that were missing on disk after the list', async () => {
    content.carPlayList.mockResolvedValueOnce({
      sections: [{ items: [{ node: 'album|s|a', title: 'A', browse: true }] }],
      refreshCovers: async () => [{ section: 0, row: 0, image: '/covers/a/256.webp' }],
    } as never);
    const { unmount } = renderHook(() => useCarPlayBridge());
    await waitFor(() => expect(emitMock).toHaveBeenCalledWith('carplay:ready'));
    await act(async () => { emitTauriEvent('carplay:list', { requestId: 9, node: 'albums' }); });
    await waitFor(() => expect(emitMock).toHaveBeenCalledWith('carplay:list-images', {
      requestId: 9,
      images: [{ section: 0, row: 0, image: '/covers/a/256.webp' }],
    }));
    const result = emitMock.mock.calls.find(([event]) => event === 'carplay:list-result');
    expect(result?.[1]).not.toHaveProperty('refreshCovers');
    unmount();
  });

  it('reports the button state first and runs button presses from the car', async () => {
    const { unmount } = renderHook(() => useCarPlayBridge());
    await waitFor(() => expect(emitMock).toHaveBeenCalledWith('carplay:state', {
      shuffle: false, repeat: 'off', starred: false, hasTrack: true, upNextTitle: 'Up next', albumTitle: 'Record',
    }));
    await act(async () => { emitTauriEvent('carplay:command', { action: 'shuffle' }); });
    expect(content.carPlayCommand).toHaveBeenCalledWith('shuffle');
    unmount();
  });

  it('plays what the car asks for and stops listening on unmount', async () => {
    const { unmount } = renderHook(() => useCarPlayBridge());
    await waitFor(() => expect(tauriMockListenerCount('carplay:play')).toBe(1));
    await act(async () => { emitTauriEvent('carplay:play', { node: 'random' }); });
    expect(content.carPlayPlay).toHaveBeenCalledWith('random');
    unmount();
    expect(tauriMockListenerCount('carplay:list')).toBe(0);
    expect(tauriMockListenerCount('carplay:play')).toBe(0);
  });
});
