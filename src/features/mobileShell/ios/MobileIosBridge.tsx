import { useEffect } from 'react';
import { useCarPlayBridge } from '@/features/mobileShell/ios/useCarPlayBridge';
import { useIosAudioInterruptions } from '@/features/mobileShell/ios/useIosAudioInterruptions';
import { useSiriBridge } from '@/features/mobileShell/ios/useSiriBridge';
import { syncLandscape } from '@/features/mobileShell/ios/iosOrientation';
import { watchMeteredNetwork } from '@/lib/network/meteredNetwork';
import { startLocalPlaybackPathRebase } from '@/features/mobileShell/ios/rebaseLocalPlaybackPaths';
import { pinFullAppVolume } from '@/features/mobileShell/utils/fullAppVolume';
import { watchInfiniteQueue } from '@/features/mobileShell/utils/infiniteQueueWatch';
import { keepScreenOnForLibraryDownloads } from '@/features/mobileShell/ios/libraryDownloadScreenOn';

/**
 * Touch shell plumbing to the native iOS side: calls / lost headphones pause the
 * player, the window starts upright (only the player may rotate), and downloads
 * learn whether the connection is mobile data. CarPlay asks here for its lists.
 * After an app update the stored hot-cache and download paths are moved onto the new
 * app container before anything checks them. The app's own volume stays at full: the
 * iPhone's buttons set the loudness. The infinite queue tops up whenever a song starts.
 * While a whole library downloads, the screen stays on (the download needs the app open).
 */
export default function MobileIosBridge() {
  useIosAudioInterruptions();
  useCarPlayBridge();
  useSiriBridge();
  useEffect(() => { syncLandscape(); }, []);
  useEffect(() => { startLocalPlaybackPathRebase(); }, []);
  useEffect(() => { pinFullAppVolume(); }, []);
  useEffect(() => watchInfiniteQueue(), []);
  useEffect(() => keepScreenOnForLibraryDownloads(), []);
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
