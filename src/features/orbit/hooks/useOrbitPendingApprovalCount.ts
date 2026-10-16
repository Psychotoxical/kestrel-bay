import { useOrbitStore } from '@/features/orbit/store/orbitStore';
import { ORBIT_DEFAULT_SETTINGS } from '@/features/orbit/api/orbit';
import { suggestionKey } from '@/features/orbit/utils/helpers';

/**
 * How many guest suggestions wait for the host's approval: the items
 * `HostApprovalQueue` lists (guest-added, not merged, not declined), and 0 when
 * auto-approve is on or this client is not the host. Drives the touch shell's
 * Orbit tab badge. A parity test keeps it in step with the approval list.
 */
export function useOrbitPendingApprovalCount(): number {
  return useOrbitStore(s => {
    const state = s.state;
    if (s.role !== 'host' || !state) return 0;
    if ((state.settings ?? ORBIT_DEFAULT_SETTINGS).autoApprove !== false) return 0;
    const merged = new Set(s.mergedSuggestionKeys);
    const declined = new Set(s.declinedSuggestionKeys);
    return state.queue.filter(q =>
      q.addedBy !== state.host
      && !merged.has(suggestionKey(q))
      && !declined.has(suggestionKey(q)),
    ).length;
  });
}
