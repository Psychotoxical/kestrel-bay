import { useEffect } from 'react';
import { installAndroidMediaCommands } from '@/features/mobileShell/android/androidMedia';
import { pinFullAppVolume } from '@/features/mobileShell/utils/fullAppVolume';

/**
 * Touch shell plumbing to the native Android side, the counterpart of `ios/MobileIosBridge`.
 * Mounted only in the Android build. Keeps the app's own volume at full (the phone's
 * buttons set the loudness) and routes the lock screen / notification / headset buttons
 * into the player. Android Auto joins here once it is built.
 */
export default function MobileAndroidBridge() {
  useEffect(() => { pinFullAppVolume(); }, []);
  useEffect(() => installAndroidMediaCommands(), []);
  return null;
}
