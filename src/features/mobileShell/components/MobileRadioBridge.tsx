import { usePlayerStore } from '@/features/playback';
import { useRadioMetadata, useRadioMprisSync } from '@/features/radio';

/**
 * The desktop PlayerBar is the always-mounted consumer that mirrors radio
 * metadata to the OS media controls. The touch shell has no PlayerBar, so
 * this renderless bridge takes over that job.
 */
export default function MobileRadioBridge() {
  const currentRadio = usePlayerStore(s => s.currentRadio);
  const radioMeta = useRadioMetadata(currentRadio ?? null);
  useRadioMprisSync(radioMeta, currentRadio);
  return null;
}
