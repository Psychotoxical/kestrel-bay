import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/util/platform', async importOriginal => ({ ...(await importOriginal<object>()), IS_ANDROID: true }));
vi.mock('@tauri-apps/api/event', () => ({ emit: vi.fn() }));

import { usePlayerStore } from '@/features/playback/store/playerStore';
import { RADIO_STARTING_EVENT } from '@/features/playback/store/radioPlayer';
import { resetAllStores } from '@/test/helpers/storeReset';
import { installAndroidMediaCommands } from './androidMedia';

const station = { id: 'r1', name: 'Jazz', streamUrl: 'https://x' };

describe('radio state for the native media session', () => {
  let setRadio: ReturnType<typeof vi.fn>;
  let stop: () => void;

  beforeEach(() => {
    resetAllStores();
    setRadio = vi.fn();
    window.PsysonicAndroidMedia = { setMetadata: vi.fn(), setPlayback: vi.fn(), setRadio } as never;
    stop = installAndroidMediaCommands();
  });
  afterEach(() => {
    stop();
    delete window.PsysonicAndroidMedia;
  });

  it('reports radio as soon as a station starts, before the store knows the station', () => {
    expect(setRadio).toHaveBeenLastCalledWith(false);
    window.dispatchEvent(new Event(RADIO_STARTING_EVENT));
    expect(setRadio).toHaveBeenLastCalledWith(true);
    // Other updates while the stream starts do not undo it.
    usePlayerStore.setState({ progress: 0.1, isPlaying: true });
    expect(setRadio).toHaveBeenLastCalledWith(true);
    usePlayerStore.setState({ currentRadio: station });
    expect(setRadio).toHaveBeenLastCalledWith(true);
  });

  it('reports the end of the radio when a song takes over or the start fails', () => {
    window.dispatchEvent(new Event(RADIO_STARTING_EVENT));
    usePlayerStore.setState({ currentRadio: station, isPlaying: true });
    usePlayerStore.setState({ currentRadio: null });
    expect(setRadio).toHaveBeenLastCalledWith(false);

    window.dispatchEvent(new Event(RADIO_STARTING_EVENT));
    usePlayerStore.setState({ isPlaying: false, currentRadio: null });
    expect(setRadio).toHaveBeenLastCalledWith(false);
  });
});
