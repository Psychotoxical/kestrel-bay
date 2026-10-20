import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { emit } from '@tauri-apps/api/event';
import { emitTauriEvent, tauriMockListenerCount } from '@/test/mocks/tauri';
import { useSiriBridge } from './useSiriBridge';

const siri = vi.hoisted(() => ({
  playSiriRequest: vi.fn(async () => true),
  siriArtistVocabulary: vi.fn(async () => ['Motorjesus', 'Insomnium']),
}));
vi.mock('@/features/mobileShell/car/siriPlay', () => siri);

const emitMock = vi.mocked(emit);

describe('useSiriBridge', () => {
  beforeEach(() => {
    emitMock.mockClear();
    siri.playSiriRequest.mockClear();
    siri.siriArtistVocabulary.mockClear();
  });

  it('reports ready once listening, plays what Siri asked for and stops on unmount', async () => {
    const { unmount } = renderHook(() => useSiriBridge());
    await waitFor(() => expect(emitMock).toHaveBeenCalledWith('siri:ready'));
    expect(tauriMockListenerCount('siri:play')).toBe(1);
    await act(async () => { emitTauriEvent('siri:play', { mediaName: 'Chaos', mediaType: 1 }); });
    expect(siri.playSiriRequest).toHaveBeenCalledWith({ mediaName: 'Chaos', mediaType: 1 });
    unmount();
    expect(tauriMockListenerCount('siri:play')).toBe(0);
  });

  it('hands Siri the library’s artist names once listening', async () => {
    const { unmount } = renderHook(() => useSiriBridge());
    await waitFor(() => expect(emitMock).toHaveBeenCalledWith('siri:vocabulary', ['Motorjesus', 'Insomnium']));
    unmount();
  });
});
