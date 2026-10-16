import { isNavidromeAudiomuseSoftwareEligible, type InstantMixProbeResult, type SubsonicServerIdentity } from '@/lib/server/subsonicServerIdentity';
import { buildCapabilityContext } from '@/lib/serverCapabilities/context';
import type { ResolvedCapability } from '@/lib/serverCapabilities/types';

export const AUDIOMUSE_NV_PLUGIN_URL = 'https://github.com/NeptuneHub/AudioMuse-AI-NV-plugin';

/** Row visibility: same as main — hide only when manual strategy proves the feature absent. */
function showAudiomuseRow(resolved: ResolvedCapability | null): boolean {
  if (!resolved || resolved.strategyId === null || resolved.status === 'ineligible') return false;
  return !(resolved.activation === 'manual' && resolved.status === 'absent');
}

/** Legacy Navidrome (< 0.62): manual toggle row below the card (not the auto header badge). */
export function showLegacyAudiomuseToggleRow(
  identity: SubsonicServerIdentity | undefined,
  instantMixProbe: InstantMixProbeResult | undefined,
  resolved: ResolvedCapability | null,
): boolean {
  const ctx = buildCapabilityContext(identity);
  if (ctx.isNavidrome && ctx.semverGte([0, 62, 0])) return false;
  if (showAudiomuseRow(resolved)) return true;
  return isNavidromeAudiomuseSoftwareEligible(identity) && instantMixProbe !== 'empty';
}
