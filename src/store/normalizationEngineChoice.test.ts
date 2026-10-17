import { beforeEach, describe, expect, it } from 'vitest';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { chooseNormalizationEngine } from './normalizationEngineChoice';

const state = () => {
  const s = useAuthStore.getState();
  return { engine: s.normalizationEngine, rg: s.replayGainEnabled, target: s.loudnessTargetLufs };
};

describe('chooseNormalizationEngine', () => {
  beforeEach(() => {
    resetAuthStore();
    useAuthStore.setState({ normalizationEngine: 'off', replayGainEnabled: false, loudnessTargetLufs: -16 });
  });

  it('ReplayGain turns its own flag on', () => {
    chooseNormalizationEngine('replaygain');
    expect(state()).toEqual({ engine: 'replaygain', rg: true, target: -16 });
  });

  it('LUFS from another engine starts at -12 and clears the ReplayGain flag', () => {
    useAuthStore.setState({ normalizationEngine: 'replaygain', replayGainEnabled: true });
    chooseNormalizationEngine('loudness');
    expect(state()).toEqual({ engine: 'loudness', rg: false, target: -12 });
  });

  it('LUFS again keeps the chosen target', () => {
    useAuthStore.setState({ normalizationEngine: 'loudness', loudnessTargetLufs: -14 });
    chooseNormalizationEngine('loudness');
    expect(state()).toEqual({ engine: 'loudness', rg: false, target: -14 });
  });

  it('Off turns both off', () => {
    useAuthStore.setState({ normalizationEngine: 'replaygain', replayGainEnabled: true });
    chooseNormalizationEngine('off');
    expect(state()).toEqual({ engine: 'off', rg: false, target: -16 });
  });
});
