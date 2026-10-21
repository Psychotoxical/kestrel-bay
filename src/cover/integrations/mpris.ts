import { coverCacheEnsure } from '@/lib/api/coverCache';
import type { InternetRadioStation } from '@/lib/api/subsonicTypes';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';
import { radioCoverRef } from '../ref';
import { buildCoverArtFetchUrl } from '../fetchUrl';
import type { CoverArtRef } from '../types';
import { coverDiskPath } from './diskPath';

function fileUrlFromDiskPath(path: string): string {
  if (!path) return '';
  path = coverDiskPath(path);
  if (path.startsWith('file://')) return path;
  return `file://${path}`;
}

/** MPRIS cover — prefer on-disk 800.webp, else ephemeral HTTPS 800 URL. */
export async function coverArtUrlForMpris(ref: CoverArtRef): Promise<string> {
  try {
    const result = await coverCacheEnsure(ref, 800);
    if (result.hit && result.path) {
      return fileUrlFromDiskPath(result.path);
    }
  } catch {
    /* fall through to fetch URL */
  }
  return buildCoverArtFetchUrl(ref, 800);
}

/**
 * The station logo for the phone's now-playing screen (lock screen, CarPlay, Android Auto),
 * which showed none for radio (car test 21.10.). Mobile only: the desktop keeps its overlay.
 */
export async function radioCoverUrlForMpris(
  station: Pick<InternetRadioStation, 'id' | 'serverId'>,
): Promise<string | null> {
  if (!IS_MOBILE_SHELL) return null;
  return coverArtUrlForMpris(radioCoverRef(station)).catch(() => null);
}
