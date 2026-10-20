import { beforeEach, describe, expect, it, vi } from 'vitest';

const audioSetVolume = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/api/audio', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api/audio')>()),
  audioSetVolume,
}));

import { usePlayerStore } from '@/features/playback/store/playerStore';
import { pinFullAppVolume } from './fullAppVolume';

describe('pinFullAppVolume', () => {
  beforeEach(() => audioSetVolume.mockClear());

  it('raises the desktop default of 80 % to full and tells the audio engine', () => {
    usePlayerStore.setState({ volume: 0.8 });
    pinFullAppVolume();
    expect(usePlayerStore.getState().volume).toBe(1);
    expect(audioSetVolume).toHaveBeenCalledWith({ volume: 1 });
  });

  it('leaves a full level alone', () => {
    usePlayerStore.setState({ volume: 1 });
    pinFullAppVolume();
    expect(audioSetVolume).not.toHaveBeenCalled();
  });
});
