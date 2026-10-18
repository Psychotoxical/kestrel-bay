import { describe, expect, it } from 'vitest';
import { audioPlayHiResBlendArgs } from '@/lib/audio/hiResCrossfadeResample';

describe('hiResCrossfadeResample (touch shell)', () => {
  it('keeps hi-res off even when a desktop settings backup switched it on', () => {
    expect(
      audioPlayHiResBlendArgs({ enableHiRes: true, hiResCrossfadeResampleHz: 96_000 }),
    ).toEqual({ hiResEnabled: false, hiResCrossfadeResampleHz: null });
  });
});
