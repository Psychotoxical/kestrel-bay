import { AlarmClock, BatteryCharging, Bell, Layers, Maximize2, type LucideIcon } from 'lucide-react';
import type { AlarmStatus } from './androidAlarm';

/** The steps in the order a user meets them. */
export const ALARM_SETUP_STEPS: ReadonlyArray<{ key: keyof AlarmStatus; icon: LucideIcon }> = [
  { key: 'notifications', icon: Bell },
  { key: 'fullScreen', icon: Maximize2 },
  { key: 'exact', icon: AlarmClock },
  { key: 'overlay', icon: Layers },
  { key: 'battery', icon: BatteryCharging },
];

/** Steps the phone still has to allow; unknown ones (older Androids) count as done. */
export function missingAlarmSetup(status: AlarmStatus | null): Array<keyof AlarmStatus> {
  return status ? ALARM_SETUP_STEPS.map(s => s.key).filter(key => status[key] === false) : [];
}
