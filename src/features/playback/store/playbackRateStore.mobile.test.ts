import { beforeEach, describe, expect, it } from 'vitest';
import { usePlaybackRateStore } from '@/features/playback/store/playbackRateStore';
import { effectivePlaybackRate } from '@/features/playback/store/playbackReportSession';
import { DEFAULT_PLAYBACK_STRATEGY } from '@/features/playback/utils/audio/playbackRateHelpers';
import { resetAllStores } from '@/test/helpers/storeReset';
import { invokeMock, onInvoke } from '@/test/mocks/tauri';

// The touch shell offers no speed control. A rate a desktop settings backup
// brought along stays stored, but the engine and the progress clock run at 1.0×.

function lastRateCall(): { enabled: boolean } | undefined {
  const calls = invokeMock.mock.calls.filter(([cmd]) => cmd === 'audio_set_playback_rate');
  return calls.length ? (calls[calls.length - 1][1] as { enabled: boolean }) : undefined;
}

beforeEach(() => {
  resetAllStores();
  usePlaybackRateStore.setState({
    enabled: true,
    speed: 1.25,
    strategy: DEFAULT_PLAYBACK_STRATEGY,
    pitchSemitones: 0,
  });
  onInvoke('audio_set_playback_rate', () => undefined);
});

describe('playback rate (touch shell)', () => {
  it('keeps the engine at 1.0× even when a desktop backup switched a rate on', () => {
    usePlaybackRateStore.getState().syncToRust();
    expect(lastRateCall()?.enabled).toBe(false);
    expect(usePlaybackRateStore.getState().speed).toBe(1.25);
  });

  it('reports 1.0× to the progress clock and the server', () => {
    expect(effectivePlaybackRate()).toBe(1.0);
  });
});
