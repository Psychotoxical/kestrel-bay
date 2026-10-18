import { describe, expect, it } from 'vitest';
import {
  heatmapCellMetrics,
  heatmapColumnMonthLabels,
  heatmapRecentWeekColumns,
} from '@/features/stats/utils/heatmapLevels';

describe('heatmapCellMetrics', () => {
  it('shrinks cells to fit narrow containers', () => {
    const m = heatmapCellMetrics(400, 53);
    expect(m.cell).toBeLessThan(14);
    expect(m.cell).toBeGreaterThanOrEqual(4);
    const total = m.labelW + m.bodyGap + 53 * m.cell + 52 * m.gap;
    expect(total).toBeLessThanOrEqual(400 + 1);
  });

  it('caps at 14px on wide containers', () => {
    const m = heatmapCellMetrics(1200, 53);
    expect(m.cell).toBe(14);
  });
});

describe('heatmapCellMetrics cap', () => {
  it('takes a larger cap for the short touch heatmap', () => {
    expect(heatmapCellMetrics(1200, 15, 22).cell).toBe(22);
  });
});

describe('heatmapRecentWeekColumns', () => {
  // Sunday 18 October 2026: the last column starts that day.
  const end = new Date(2026, 9, 18);

  it('ends with the week of the end date and pads the days after it', () => {
    const { weeks } = heatmapRecentWeekColumns(2026, new Map(), end, 15);
    expect(weeks).toHaveLength(15);
    const last = weeks[14];
    expect(last[0].date).toBe('2026-10-18');
    expect(last.slice(1).every(c => c.date === '')).toBe(true);
    expect(weeks[0][0].date).toBe('2026-07-12');
  });

  it('scales to the shown days only and pads days outside the year', () => {
    const counts = new Map([['2026-01-02', 3], ['2026-03-01', 50], ['2025-12-31', 9]]);
    const { weeks, maxCount } = heatmapRecentWeekColumns(2026, counts, new Date(2026, 0, 10), 3);
    expect(maxCount).toBe(3);
    expect(weeks.flat().some(c => c.date === '2025-12-31')).toBe(false);
    expect(weeks.flat().find(c => c.date === '2026-01-02')?.count).toBe(3);
  });
});

describe('heatmapColumnMonthLabels', () => {
  it('labels the first column and every month start', () => {
    const { weeks } = heatmapRecentWeekColumns(2026, new Map(), new Date(2026, 9, 18), 15);
    expect(heatmapColumnMonthLabels(weeks, 'en').map(l => l.label)).toEqual(['Jul', 'Aug', 'Sep', 'Oct']);
  });
});
