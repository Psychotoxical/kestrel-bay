import { useAuthStore } from '@/store/authStore';
import type { NormalizationEngine } from '@/store/authStoreTypes';

/**
 * Switch the normalization engine the way Settings → Audio does: only one
 * engine is live at a time (the ReplayGain flag follows the choice), and
 * switching to LUFS from another engine starts at -12 LUFS.
 */
export function chooseNormalizationEngine(engine: NormalizationEngine): void {
  const auth = useAuthStore.getState();
  if (engine === 'off') {
    auth.setReplayGainEnabled(false);
    auth.setNormalizationEngine('off');
    return;
  }
  if (engine === 'replaygain') {
    auth.setReplayGainEnabled(true);
    auth.setNormalizationEngine('replaygain');
    return;
  }
  auth.setReplayGainEnabled(false);
  if (auth.normalizationEngine !== 'loudness') auth.setLoudnessTargetLufs(-12);
  auth.setNormalizationEngine('loudness');
}
