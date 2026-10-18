import { IS_MOBILE_SHELL } from '@/lib/util/platform';

/** Hi-Res transition blend output rates (Hz) for crossfade, AutoDJ, and gapless. */
export const HI_RES_CROSSFADE_RESAMPLE_OPTIONS = [44_100, 88_200, 96_000] as const;

export type HiResCrossfadeResampleHz = (typeof HI_RES_CROSSFADE_RESAMPLE_OPTIONS)[number];

export const DEFAULT_HI_RES_CROSSFADE_RESAMPLE_HZ: HiResCrossfadeResampleHz = 44_100;

export function sanitizeHiResCrossfadeResampleHz(value: unknown): HiResCrossfadeResampleHz {
  if (value === 88_200 || value === 96_000) return value;
  return DEFAULT_HI_RES_CROSSFADE_RESAMPLE_HZ;
}

/**
 * Args forwarded to `audio_play` for hi-res + crossfade blend rate. Always off
 * in the touch shell, also when a desktop settings backup brought the setting
 * along: the iPhone output stays at 48 kHz without an external converter.
 */
export function audioPlayHiResBlendArgs(auth: {
  enableHiRes: boolean;
  hiResCrossfadeResampleHz: HiResCrossfadeResampleHz;
}): {
  hiResEnabled: boolean;
  hiResCrossfadeResampleHz: number | null;
} {
  const hiResEnabled = !IS_MOBILE_SHELL && auth.enableHiRes;
  return {
    hiResEnabled,
    hiResCrossfadeResampleHz: hiResEnabled ? auth.hiResCrossfadeResampleHz : null,
  };
}
