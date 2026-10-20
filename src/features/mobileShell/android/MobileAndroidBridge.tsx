import { useEffect } from 'react';
import { pinFullAppVolume } from '@/features/mobileShell/utils/fullAppVolume';

/**
 * Touch shell plumbing to the native Android side, the counterpart of `ios/MobileIosBridge`.
 * Mounted only in the Android build. For now it keeps the app's own volume at full: the
 * phone's buttons set the loudness. Media session, background playback, the back button
 * and Android Auto join here as they are built.
 */
export default function MobileAndroidBridge() {
  useEffect(() => { pinFullAppVolume(); }, []);
  return null;
}
