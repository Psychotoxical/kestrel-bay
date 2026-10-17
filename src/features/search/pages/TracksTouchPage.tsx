import TracksPageChrome from '@/features/search/components/TracksPageChrome';
import { useOfflineBrowseContext } from '@/features/offline';

/**
 * Tracks in the touch shell: a discovery page (track of the moment, highly
 * rated, random picks). Thousands of songs in one list are no use on a phone;
 * a single song is found through search. The desktop keeps the browse page.
 */
export default function TracksTouchPage() {
  const { active: offlineBrowseActive } = useOfflineBrowseContext();
  return (
    <div className="content-body animate-fade-in tracks-page tracks-page--touch">
      <TracksPageChrome hideDiscoveryChrome={offlineBrowseActive} />
    </div>
  );
}
