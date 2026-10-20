import { useEffect } from 'react';
import { useCarPlayBridge } from '@/features/mobileShell/hooks/useCarPlayBridge';
import { useIosAudioInterruptions } from '@/features/mobileShell/hooks/useIosAudioInterruptions';
import { useSiriBridge } from '@/features/mobileShell/hooks/useSiriBridge';
import { syncLandscape } from '@/features/mobileShell/utils/iosOrientation';
import { watchMeteredNetwork } from '@/lib/network/meteredNetwork';
import { startLocalPlaybackPathRebase } from '@/features/mobileShell/utils/rebaseLocalPlaybackPaths';
import { pinFullAppVolume } from '@/features/mobileShell/utils/fullAppVolume';

/**
 * Touch shell plumbing to the native iOS side: calls / lost headphones pause the
 * player, the window starts upright (only the player may rotate), and downloads
 * learn whether the connection is mobile data. CarPlay asks here for its lists.
 * After an app update the stored hot-cache and download paths are moved onto the new
 * app container before anything checks them. The app's own volume stays at full: the
 * iPhone's buttons set the loudness.
 */
export default function MobileIosBridge() {
  useIosAudioInterruptions();
  useCarPlayBridge();
  useSiriBridge();
  useEffect(() => { syncLandscape(); }, []);
  useEffect(() => { startLocalPlaybackPathRebase(); }, []);
  useEffect(() => { pinFullAppVolume(); }, []);
  useEffect(() => {
    let off: (() => void) | undefined;
    let unmounted = false;
    void watchMeteredNetwork().then(stop => {
      if (unmounted) stop();
      else off = stop;
    }).catch(() => {});
    return () => {
      unmounted = true;
      off?.();
    };
  }, []);
  return null;
}
