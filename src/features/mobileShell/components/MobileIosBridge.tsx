import { useEffect } from 'react';
import { useIosAudioInterruptions } from '@/features/mobileShell/hooks/useIosAudioInterruptions';
import { syncLandscape } from '@/features/mobileShell/utils/iosOrientation';

/**
 * Touch shell plumbing to the native iOS side: calls / lost headphones pause the
 * player, and the window starts upright (only the player may rotate).
 */
export default function MobileIosBridge() {
  useIosAudioInterruptions();
  useEffect(() => { syncLandscape(); }, []);
  return null;
}
