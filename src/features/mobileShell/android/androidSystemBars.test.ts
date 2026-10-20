import { describe, expect, it } from 'vitest';
import { luminanceOf } from './androidSystemBars';

describe('luminanceOf', () => {
  it('reads rgb() and rgba() colours', () => {
    expect(luminanceOf('rgb(0, 0, 0)')).toBe(0);
    expect(luminanceOf('rgba(255, 255, 255, 1)')).toBeCloseTo(1, 5);
  });

  it('tells a dark theme background from a light one', () => {
    expect(luminanceOf('rgb(31, 31, 40)')!).toBeLessThan(0.4);
    expect(luminanceOf('rgb(239, 241, 245)')!).toBeGreaterThan(0.4);
  });

  it('returns null for something that is not a colour', () => {
    expect(luminanceOf('transparent')).toBeNull();
  });
});
