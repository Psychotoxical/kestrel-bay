import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { emitTauriEvent, tauriMockListenerCount } from '@/test/mocks/tauri';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { useIosAudioInterruptions } from './useIosAudioInterruptions';

const pause = vi.fn(() => usePlayerStore.setState({ isPlaying: false }));
const resume = vi.fn(() => usePlayerStore.setState({ isPlaying: true }));

async function mount() {
  const hook = renderHook(() => useIosAudioInterruptions());
  await waitFor(() => expect(tauriMockListenerCount('ios-audio:route-lost')).toBe(1));
  return hook;
}

describe('useIosAudioInterruptions', () => {
  beforeEach(() => {
    pause.mockClear();
    resume.mockClear();
    usePlayerStore.setState({ isPlaying: true, pause, resume });
  });

  it('a call pauses the player and, when iOS allows it, resumes it afterwards', async () => {
    const { unmount } = await mount();
    emitTauriEvent('ios-audio:interruption', { began: true, shouldResume: false });
    expect(pause).toHaveBeenCalledOnce();
    emitTauriEvent('ios-audio:interruption', { began: false, shouldResume: true });
    expect(resume).toHaveBeenCalledOnce();
    unmount();
  });

  it('stays paused when iOS does not allow resuming', async () => {
    const { unmount } = await mount();
    emitTauriEvent('ios-audio:interruption', { began: true, shouldResume: false });
    emitTauriEvent('ios-audio:interruption', { began: false, shouldResume: false });
    expect(resume).not.toHaveBeenCalled();
    unmount();
  });

  it('does not start music that was not playing before the call', async () => {
    usePlayerStore.setState({ isPlaying: false });
    const { unmount } = await mount();
    emitTauriEvent('ios-audio:interruption', { began: true, shouldResume: false });
    emitTauriEvent('ios-audio:interruption', { began: false, shouldResume: true });
    expect(pause).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
    unmount();
  });

  it('unplugged headphones pause for good, even if a call ends afterwards', async () => {
    const { unmount } = await mount();
    emitTauriEvent('ios-audio:interruption', { began: true, shouldResume: false });
    emitTauriEvent('ios-audio:route-lost', null);
    emitTauriEvent('ios-audio:interruption', { began: false, shouldResume: true });
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
