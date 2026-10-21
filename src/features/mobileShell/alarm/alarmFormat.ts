import type { TFunction } from 'i18next';
import { nextAlarmTime, type Alarm } from './alarmStore';

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const alarmClock = (alarm: Pick<Alarm, 'hour' | 'minute'>) => `${pad2(alarm.hour)}:${pad2(alarm.minute)}`;

/** ISO weekdays Monday … Sunday with the language's narrowest names ("M", "D", …). */
export function weekdayNames(language: string, width: 'narrow' | 'short' = 'narrow'): string[] {
  const format = new Intl.DateTimeFormat(language, { weekday: width });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => format.format(new Date(2024, 0, 1 + i)));
}

/** "Once", "Every day", "Weekdays", "Weekend" or the days themselves ("Mo, Mi, Fr"). */
export function repeatSummary(days: number[], t: TFunction, language: string): string {
  const set = [...days].sort().join();
  if (set === '') return t('alarm.once');
  if (set === '1,2,3,4,5,6,7') return t('alarm.daily');
  if (set === '1,2,3,4,5') return t('alarm.weekdays');
  if (set === '6,7') return t('alarm.weekend');
  const names = weekdayNames(language, 'short');
  return [...days].sort().map(d => names[d - 1]).join(', ');
}

/** "Rings in 7 h 12 min", or null while off. */
export function ringsIn(alarm: Alarm, t: TFunction, now = new Date()): string | null {
  const at = nextAlarmTime(alarm, now);
  if (!at) return null;
  const total = Math.max(1, Math.ceil((at.getTime() - now.getTime()) / 60_000));
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  const time = hours > 0 ? t('alarm.hoursMinutes', { hours, minutes }) : t('alarm.minutesOnly', { minutes });
  return t('alarm.inTime', { time });
}

export function sourceLabel(alarm: Alarm, t: TFunction): string {
  switch (alarm.source.kind) {
    case 'luckymix': return t('alarm.sourceLuckymix');
    case 'random': return t('alarm.sourceRandom');
    case 'favorites': return t('alarm.sourceFavorites');
    case 'playlist': return alarm.source.name || t('alarm.sourcePlaylist');
  }
}
