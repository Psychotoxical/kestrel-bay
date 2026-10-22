import { describe, expect, it } from 'vitest';
import i18n from '@/lib/i18n';
import { newAlarm, nextAlarmTime, sanitizeAlarms, type Alarm } from './alarmStore';
import { repeatSummary, ringsIn } from './alarmFormat';

const alarm = (patch: Partial<Alarm>): Alarm => ({ ...newAlarm('a'), ...patch });
// Tuesday, 21 Oct 2026, 08:00 local time.
const tuesdayMorning = new Date(2026, 9, 21, 8, 0);

describe('nextAlarmTime', () => {
  it('rings later today when the time is still ahead', () => {
    expect(nextAlarmTime(alarm({ hour: 9, minute: 30, days: [] }), tuesdayMorning))
      .toEqual(new Date(2026, 9, 21, 9, 30));
  });

  it('a one-time alarm whose time has passed rings tomorrow', () => {
    expect(nextAlarmTime(alarm({ hour: 7, minute: 0, days: [] }), tuesdayMorning))
      .toEqual(new Date(2026, 9, 22, 7, 0));
  });

  it('a weekend alarm waits for Saturday', () => {
    expect(nextAlarmTime(alarm({ hour: 9, minute: 0, days: [6, 7] }), tuesdayMorning))
      .toEqual(new Date(2026, 9, 24, 9, 0));
  });

  it('an alarm that is off never rings', () => {
    expect(nextAlarmTime(alarm({ enabled: false }), tuesdayMorning)).toBeNull();
  });
});

describe('sanitizeAlarms', () => {
  it('keeps valid alarms and repairs what an older version left behind', () => {
    const [kept] = sanitizeAlarms([
      { id: 'x', hour: 25, minute: -3, days: [1, 1, 9, 3], source: { kind: 'nope' }, maxVolume: 400 },
      { hour: 7 },
      'junk',
    ]);
    expect(kept).toMatchObject({ id: 'x', hour: 23, minute: 0, days: [1, 3], maxVolume: 100, source: { kind: 'luckymix' } });
    expect(sanitizeAlarms([{ hour: 7 }])).toEqual([]);
  });

  it('gives older alarms the old 10 minutes and keeps "never"', () => {
    const [older, never, tooLong] = sanitizeAlarms([
      { id: 'old' },
      { id: 'never', silenceMin: 0 },
      { id: 'long', silenceMin: 500 },
    ]);
    expect(older.silenceMin).toBe(10);
    expect(never.silenceMin).toBe(0);
    expect(tooLong.silenceMin).toBe(60);
  });
});

describe('alarm texts', () => {
  const t = i18n.getFixedT('de');

  it('names common repeat patterns', () => {
    expect(repeatSummary([], t, 'de')).toBe('Einmalig');
    expect(repeatSummary([1, 2, 3, 4, 5], t, 'de')).toBe('Werktags');
    expect(repeatSummary([6, 7], t, 'de')).toBe('Wochenende');
    expect(repeatSummary([1, 2, 3, 4, 5, 6, 7], t, 'de')).toBe('Täglich');
  });

  it('says how long until it rings', () => {
    expect(ringsIn(alarm({ hour: 9, minute: 15, days: [] }), t, tuesdayMorning)).toBe('Klingelt in 1 Std. 15 Min.');
    expect(ringsIn(alarm({ enabled: false }), t, tuesdayMorning)).toBeNull();
  });
});
