import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

export type TrackListCoverArtSurface = 'queue' | 'pages';

/**
 * Separate persisted toggles: queue chrome vs browse tracklists. The touch
 * shell's queue always shows covers, as its other song lists do.
 */
export function useTrackListCoverArtEnabled(surface: TrackListCoverArtSurface): boolean {
  const queueEnabled = useAuthStore(s => s.queueTrackListCovers);
  const pagesEnabled = useThemeStore(s => s.trackListCoverArtOnPages);
  return surface === 'queue' ? IS_MOBILE_SHELL || queueEnabled : pagesEnabled;
}
