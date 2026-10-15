import { describe, expect, it } from 'vitest';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';
import { computeCellWidthPx, estimateRowHeightPx } from '@/lib/util/cardGridLayout';

describe('touch shell build flag', () => {
  it('is on in this run', () => {
    expect(IS_MOBILE_SHELL).toBe(true);
  });

  it('album grid rows fit the slimmer touch tiles (title + artist under the cover)', () => {
    const cell = computeCellWidthPx(408, 2);
    expect(estimateRowHeightPx(cell, 'album')).toBe(Math.ceil(cell + 66));
  });

  it('other grids keep the desktop row estimate', () => {
    expect(estimateRowHeightPx(196, 'artist')).toBe(Math.max(200, Math.ceil(196 + 72)));
  });
});
