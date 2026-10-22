import type { TFunction } from 'i18next';
import { ChevronRight, Signal } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import SettingsSubSection from '@/features/settings/components/SettingsSubSection';
import { useMobileActionSheetStore } from '@/features/mobileShell/store/mobileActionSheetStore';
import { allNormalizedAddresses, isLanUrl } from '@/lib/server/serverAddress';
import { connectBaseUrlForServer, normalizeServerBaseUrl } from '@/lib/server/serverEndpoint';
import { isNavidromeServer } from '@/lib/server/subsonicServerIdentity';
import { serverListDisplayLabel } from '@/lib/server/serverDisplayName';
import {
  STREAM_FORMAT_OPTIONS,
  STREAM_MAX_BITRATE_OPTIONS,
  sanitizeStreamMaxBitRateKbps,
  sanitizeStreamRequestFormat,
  type StreamMaxBitRateKbps,
  type StreamRequestFormat,
} from '@/lib/audio/streamQuality';

/**
 * Touch shell: the active server's per-address streaming cap, under Audio
 * instead of deep inside the server sheet. Writes the same per-address
 * preference the server form edits (`streamQualityByAddress` /
 * `streamFormatByAddress`); the desktop keeps its editor in the server form.
 */
export function StreamQualityTouchSection({ t }: { t: TFunction }) {
  const servers = useAuthStore(s => s.servers);
  const server = useAuthStore(s => s.getActiveServer());
  const identity = useAuthStore(s => (server ? s.subsonicServerIdentityByServer[server.id] : undefined));
  const qualityByAddress = useAuthStore(s => s.streamQualityByAddress);
  const formatByAddress = useAuthStore(s => s.streamFormatByAddress);
  const setQuality = useAuthStore(s => s.setStreamQualityForAddress);
  const setFormat = useAuthStore(s => s.setStreamFormatForAddress);

  if (!server) return null;
  const addresses = allNormalizedAddresses(server);
  if (addresses.length === 0) return null;
  const navidrome = isNavidromeServer(identity);
  const connected = normalizeServerBaseUrl(connectBaseUrlForServer(server));

  const qualityLabel = (kbps: StreamMaxBitRateKbps) => (kbps === 0
    ? t('settings.streamQualityOriginal')
    : t('settings.streamQualityKbps', { kbps }));
  const formatLabel = (format: StreamRequestFormat) => (format === 'auto'
    ? t('settings.streamFormatAuto')
    : format.toUpperCase());
  const valueLabel = (address: string) => {
    const kbps = qualityByAddress[address] ?? 0;
    const format = formatByAddress[address] ?? 'auto';
    return kbps === 0 ? qualityLabel(0) : `${qualityLabel(kbps)} · ${formatLabel(format)}`;
  };

  const pick = async (address: string) => {
    const sheet = useMobileActionSheetStore.getState();
    const currentKbps = qualityByAddress[address] ?? 0;
    const kbpsChoice = await sheet.request({
      title: t('settings.streamQualityTitle'),
      message: address,
      actions: STREAM_MAX_BITRATE_OPTIONS.map(kbps => ({
        id: String(kbps),
        label: qualityLabel(kbps),
        primary: kbps === currentKbps,
      })),
    });
    if (kbpsChoice === null) return;
    const kbps = sanitizeStreamMaxBitRateKbps(Number(kbpsChoice));
    setQuality(address, kbps);
    // Without a cap Navidrome sends the original file; the format only matters with one.
    if (kbps === 0) return;
    const currentFormat = formatByAddress[address] ?? 'auto';
    const formatChoice = await sheet.request({
      title: t('settings.streamFormatLabel'),
      message: address,
      actions: STREAM_FORMAT_OPTIONS.map(format => ({
        id: format,
        label: formatLabel(format),
        primary: format === currentFormat,
      })),
    });
    if (formatChoice === null) return;
    setFormat(address, sanitizeStreamRequestFormat(formatChoice));
  };

  return (
    <SettingsSubSection title={t('settings.streamQualityTitle')} icon={<Signal size={16} />}>
      <div className="touch-cache" data-settings-search={t('settings.streamQualityTitle')}>
        <div className="touch-cache__block">
          <div className="touch-cache__title">{serverListDisplayLabel(server, servers)}</div>
          <div className="mobile-list-group">
            {addresses.map(address => (
              <button
                key={address}
                type="button"
                className="mobile-list-row mobile-list-row--wrap"
                disabled={!navidrome}
                onClick={() => void pick(address)}
              >
                <span className="mobile-list-row__text">
                  <span className="mobile-list-row__label">
                    {isLanUrl(address) ? t('settings.streamQualityTouchHome') : t('settings.streamQualityTouchInternet')}
                  </span>
                  <span className="mobile-list-row__sub">
                    {address === connected ? `${address} · ${t('settings.streamQualityTouchConnected')}` : address}
                  </span>
                </span>
                <span className="mobile-list-row__detail">{navidrome ? valueLabel(address) : qualityLabel(0)}</span>
                {navidrome && <ChevronRight size={16} className="mobile-list-row__chevron" aria-hidden />}
              </button>
            ))}
          </div>
          <p className="touch-cache__footer">
            {navidrome ? t('settings.streamQualityTouchFooter') : t('settings.streamQualityTouchNavidromeOnly')}
          </p>
        </div>
      </div>
    </SettingsSubSection>
  );
}
