import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { emitTauriEvent, tauriMockListenerCount } from '@/test/mocks/tauri';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { useAuthStore } from '@/store/authStore';
import { useIosAudioInterruptions } from './useIosAudioInterruptions';

const audio = vi.hoisted(() => ({
  // The engine reopens its output and reports it, as audio_set_device does.
  audioSetDevice: vi.fn(async () => { emitTauriEvent('audio:device-changed', 12); }),
}));
vi.mock('@/lib/api/audio', () => ({ audioSetDevice: audio.audioSetDevice }));

const pause = vi.fn(() => usePlayerStore.setState({ isPlaying: false }));
const resume = vi.fn(() => usePlayerStore.setState({ isPlaying: true }));

async function mount() {
  const hook = renderHook(() => useIosAudioInterruptions());
  await waitFor(() => expect(tauriMockListenerCount('ios-audio:route-lost')).toBe(1));
  return hook;
}

const interruption = (began: boolean, shouldResume = false) =>
  act(async () => { emitTauriEvent('ios-audio:interruption', { began, shouldResume }); });

describe('useIosAudioInterruptions', () => {
  beforeEach(() => {
    pause.mockClear();
    resume.mockClear();
    audio.audioSetDevice.mockClear();
    useAuthStore.setState({ audioOutputDevice: null });
    usePlayerStore.setState({ isPlaying: true, pause, resume });
  });

  it('a call pauses; afterwards the output is reopened and then the player resumes', async () => {
    const { unmount } = await mount();
    await interruption(true);
    expect(pause).toHaveBeenCalledOnce();
    await interruption(false, true);
    await waitFor(() => expect(resume).toHaveBeenCalledOnce());
    expect(audio.audioSetDevice).toHaveBeenCalledWith({ deviceName: null });
    expect(audio.audioSetDevice.mock.invocationCallOrder[0]).toBeLessThan(resume.mock.invocationCallOrder[0]);
    unmount();
  });

  it('a starting radio station taking the audio session over does not pause', async () => {
    const { unmount } = await mount();
    window.dispatchEvent(new Event('psysonic:radio-starting'));
    await interruption(true);
    expect(pause).not.toHaveBeenCalled();
    unmount();
  });

  it('resumes only after the engine reported the reopened output', async () => {
    let finishReopen!: () => void;
    audio.audioSetDevice.mockImplementationOnce(() => new Promise<void>(resolve => { finishReopen = resolve; }));
    const { unmount } = await mount();
    await interruption(true);
    await interruption(false, true);
    await waitFor(() => expect(audio.audioSetDevice).toHaveBeenCalledOnce());
    expect(resume).not.toHaveBeenCalled();
    await act(async () => {
      emitTauriEvent('audio:device-changed', 12);
      finishReopen();
    });
    await waitFor(() => expect(resume).toHaveBeenCalledOnce());
    unmount();
  });

  it('reopens the output but stays paused when iOS does not allow resuming', async () => {
    const { unmount } = await mount();
    await interruption(true);
    await interruption(false, false);
    await waitFor(() => expect(audio.audioSetDevice).toHaveBeenCalledOnce());
    expect(resume).not.toHaveBeenCalled();
    unmount();
  });

  it('does not start music that was not playing before the call, but still reopens the output', async () => {
    usePlayerStore.setState({ isPlaying: false });
    const { unmount } = await mount();
    await interruption(true);
    await interruption(false, true);
    await waitFor(() => expect(audio.audioSetDevice).toHaveBeenCalledOnce());
    expect(pause).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    unmount();
  });

  it('unplugged headphones pause for good, even if a call ends afterwards', async () => {
    const { unmount } = await mount();
    await interruption(true);
    await act(async () => { emitTauriEvent('ios-audio:route-lost', null); });
    await interruption(false, true);
    await waitFor(() => expect(audio.audioSetDevice).toHaveBeenCalledOnce());
    expect(resume).not.toHaveBeenCalled();
    unmount();
  });

  it('when iOS never reports the end, coming back to the app reopens the output without playing', async () => {
    const { unmount } = await mount();
    await interruption(true);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(audio.audioSetDevice).toHaveBeenCalledOnce());
    // A late end report changes nothing any more.
    await interruption(false, true);
    expect(audio.audioSetDevice).toHaveBeenCalledOnce();
    expect(resume).not.toHaveBeenCalled();
    unmount();
  });

  it('stops listening when unmounted', async () => {
    const { unmount } = await mount();
    unmount();
    expect(tauriMockListenerCount('ios-audio:interruption')).toBe(0);
    expect(tauriMockListenerCount('ios-audio:route-lost')).toBe(0);
  });
});
