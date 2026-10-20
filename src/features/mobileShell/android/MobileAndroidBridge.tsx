import { useEffect } from 'react';
import { installAndroidAuto } from '@/features/mobileShell/android/androidAuto';
import { installAndroidMediaCommands } from '@/features/mobileShell/android/androidMedia';
import { installAndroidSystemBars } from '@/features/mobileShell/android/androidSystemBars';
import { watchAndroidMeteredNetwork } from '@/features/mobileShell/android/androidNetwork';
import { pinFullAppVolume } from '@/features/mobileShell/utils/fullAppVolume';

/**
 * Touch shell plumbing to the native Android side, the counterpart of `ios/MobileIosBridge`.
 * Mounted only in the Android build. Keeps the app's own volume at full (the phone's
 * buttons set the loudness) and routes the lock screen / notification / headset buttons
 * into the player, and answers Android Auto.
 */
export default function MobileAndroidBridge() {
  useEffect(() => { pinFullAppVolume(); }, []);
  useEffect(() => installAndroidMediaCommands(), []);
  useEffect(() => installAndroidSystemBars(), []);
  useEffect(() => watchAndroidMeteredNetwork(), []);
  useEffect(() => installAndroidAuto(), []);
  return null;
}
