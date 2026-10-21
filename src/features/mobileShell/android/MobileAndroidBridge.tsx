import { useEffect } from 'react';
import { installAndroidAuto } from '@/features/mobileShell/android/androidAuto';
import { installAndroidBack } from '@/features/mobileShell/android/androidBack';
import { installAndroidMediaCommands } from '@/features/mobileShell/android/androidMedia';
import { installAndroidSystemBars } from '@/features/mobileShell/android/androidSystemBars';
import { watchAndroidMeteredNetwork } from '@/features/mobileShell/android/androidNetwork';
import { pinFullAppVolume } from '@/features/mobileShell/utils/fullAppVolume';
import { watchInfiniteQueue } from '@/features/mobileShell/utils/infiniteQueueWatch';
import { installAndroidAlarm } from '@/features/mobileShell/alarm/androidAlarm';
import AlarmRingingScreen from '@/features/mobileShell/alarm/AlarmRingingScreen';

/**
 * Touch shell plumbing to the native Android side, the counterpart of `ios/MobileIosBridge`.
 * Mounted only in the Android build. Keeps the app's own volume at full (the phone's
 * buttons set the loudness) and routes the lock screen / notification / headset buttons
 * into the player, answers Android Auto, lets the back key close sheets and menus first, and
 * tops up the infinite queue whenever a song starts. Also the music alarm and its ringing screen.
 */
export default function MobileAndroidBridge() {
  useEffect(() => { pinFullAppVolume(); }, []);
  useEffect(() => installAndroidMediaCommands(), []);
  useEffect(() => installAndroidSystemBars(), []);
  useEffect(() => watchAndroidMeteredNetwork(), []);
  useEffect(() => installAndroidAuto(), []);
  useEffect(() => installAndroidBack(), []);
  useEffect(() => watchInfiniteQueue(), []);
  useEffect(() => installAndroidAlarm(), []);
  return <AlarmRingingScreen />;
}
