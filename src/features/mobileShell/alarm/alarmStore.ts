import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * ⚠️ Android territory. The music alarm (Frank 21.10., wishes from Asra): the alarms live
 * here and go to the native side whole after every change (`androidAlarm.ts`), which sets
 * the soonest one in the system (`src-tauri/android/PsysonicAlarm.kt`).
 */

/** What the alarm plays. */
export type AlarmSource =
  | { kind: 'luckymix' }
  | { kind: 'random' }
  | { kind: 'favorites' }
  | { kind: 'playlist'; id: string; serverId?: string; name: string };

export interface Alarm {
  id: string;
  hour: number;
  minute: number;
  /** ISO weekdays it repeats on (Monday = 1 … Sunday = 7); none = once. */
  days: number[];
  enabled: boolean;
  source: AlarmSource;
  shuffle: boolean;
  snoozeMin: number;
  /** Seconds from low to `maxVolume`; 0 = at once. */
  fadeSecs: number;
  /** Cap for the media volume while it rings, in percent. */
  maxVolume: number;
  vibrate: boolean;
  label: string;
}

export const SNOOZE_CHOICES = [5, 9, 10, 15, 20] as const;
export const FADE_CHOICES = [0, 30, 60, 120] as const;

export function newAlarm(id: string, now = new Date()): Alarm {
  return {
    id,
    hour: now.getHours() < 12 ? 7 : now.getHours(),
    minute: 0,
    days: [1, 2, 3, 4, 5],
    enabled: true,
    source: { kind: 'luckymix' },
    shuffle: true,
    snoozeMin: 9,
    fadeSecs: 30,
    maxVolume: 70,
    vibrate: true,
    label: '',
  };
}

const clamp = (value: unknown, min: number, max: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

function sanitizeSource(value: unknown): AlarmSource {
  const source = value as Partial<AlarmSource> | undefined;
  if (source?.kind === 'playlist' && typeof source.id === 'string' && source.id) {
    return {
      kind: 'playlist',
      id: source.id,
      serverId: typeof source.serverId === 'string' ? source.serverId : undefined,
      name: typeof source.name === 'string' ? source.name : '',
    };
  }
  if (source?.kind === 'random' || source?.kind === 'favorites') return { kind: source.kind };
  return { kind: 'luckymix' };
}

/** Persisted alarms outlive the code that wrote them: keep what is valid, fill the rest. */
export function sanitizeAlarms(value: unknown): Alarm[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(raw => {
    if (!raw || typeof raw !== 'object' || typeof (raw as Alarm).id !== 'string') return [];
    const a = raw as Partial<Alarm>;
    const base = newAlarm(a.id as string);
    return [{
      ...base,
      hour: clamp(a.hour, 0, 23, base.hour),
      minute: clamp(a.minute, 0, 59, base.minute),
      days: Array.isArray(a.days)
        ? [...new Set(a.days.filter(d => Number.isInteger(d) && d >= 1 && d <= 7))].sort()
        : base.days,
      enabled: a.enabled !== false,
      source: sanitizeSource(a.source),
      shuffle: a.shuffle !== false,
      snoozeMin: clamp(a.snoozeMin, 1, 60, base.snoozeMin),
      fadeSecs: clamp(a.fadeSecs, 0, 600, base.fadeSecs),
      maxVolume: clamp(a.maxVolume, 5, 100, base.maxVolume),
      vibrate: a.vibrate !== false,
      label: typeof a.label === 'string' ? a.label.slice(0, 60) : '',
    }];
  });
}

interface AlarmStore {
  alarms: Alarm[];
  /** The alarm that rings now (the ringing screen shows it). */
  ringing: Alarm | null;
  save: (alarm: Alarm) => void;
  remove: (id: string) => void;
  setEnabled: (id: string, enabled: boolean) => void;
  setRinging: (alarm: Alarm | null) => void;
}

export const useAlarmStore = create<AlarmStore>()(
  persist(
    set => ({
      alarms: [],
      ringing: null,
      save: alarm => set(s => {
        const exists = s.alarms.some(a => a.id === alarm.id);
        const alarms = exists ? s.alarms.map(a => (a.id === alarm.id ? alarm : a)) : [...s.alarms, alarm];
        return { alarms: alarms.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute)) };
      }),
      remove: id => set(s => ({ alarms: s.alarms.filter(a => a.id !== id) })),
      setEnabled: (id, enabled) => set(s => ({
        alarms: s.alarms.map(a => (a.id === id ? { ...a, enabled } : a)),
      })),
      setRinging: ringing => set({ ringing }),
    }),
    {
      name: 'psysonic_alarms',
      version: 1,
      partialize: s => ({ alarms: s.alarms }),
      merge: (persistedState, currentState) => ({
        ...currentState,
        alarms: sanitizeAlarms((persistedState as { alarms?: unknown } | undefined)?.alarms),
      }),
    },
  ),
);

/** The next time `alarm` rings after `now` (as the native side computes it), or null when off. */
export function nextAlarmTime(alarm: Alarm, now = new Date()): Date | null {
  if (!alarm.enabled) return null;
  for (let offset = 0; offset <= 7; offset++) {
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, alarm.hour, alarm.minute);
    if (at <= now) continue;
    const isoDay = at.getDay() === 0 ? 7 : at.getDay();
    if (alarm.days.length === 0 || alarm.days.includes(isoDay)) return at;
  }
  return null;
}
