import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

export type TrackListCoverArtSurface = 'queue' | 'pages';

/**
 * Separate persisted toggles: queue chrome vs browse tracklists. The touch
 * shell's song lists always show covers, so it offers neither toggle.
 */
export function useTrackListCoverArtEnabled(surface: TrackListCoverArtSurface): boolean {
  const queueEnabled = useAuthStore(s => s.queueTrackListCovers);
  const pagesEnabled = useThemeStore(s => s.trackListCoverArtOnPages);
  return IS_MOBILE_SHELL || (surface === 'queue' ? queueEnabled : pagesEnabled);
}
