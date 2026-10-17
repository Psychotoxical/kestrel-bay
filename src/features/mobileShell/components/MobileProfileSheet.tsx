import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  BarChart3, ChevronRight, EyeOff, HardDriveDownload, HelpCircle, Server, Settings, Sparkles,
  type LucideIcon,
} from 'lucide-react';
import PsysonicLogo from '@/ui/PsysonicLogo';
import { usePrivateModeStore } from '@/features/privateMode';
import { useReactiveOfflineBrowseContext } from '@/features/sidebar';
import type { ConnectionStatus } from '@/lib/hooks/useConnectionStatus';
import { version as appVersion } from '@/../package.json';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';

interface Props {
  serverName: string;
  connStatus: ConnectionStatus;
  isLan: boolean;
  onClose: () => void;
}

function SheetRow({ icon: Icon, label, detail, onClick }: {
  icon: LucideIcon;
  label: string;
  detail?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="mobile-list-row" onClick={onClick}>
      <Icon className="mobile-list-row__icon" size={22} strokeWidth={1.9} aria-hidden="true" />
      <span className="mobile-list-row__label">{label}</span>
      {detail && <span className="mobile-list-row__detail">{detail}</span>}
      <ChevronRight className="mobile-list-row__chevron" size={18} aria-hidden="true" />
    </button>
  );
}

/** Account sheet behind the Mainstage header button: server, statistics, settings, help. */
export default function MobileProfileSheet({ serverName, connStatus, isLan, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const privateMode = usePrivateModeStore(s => s.active);
  const togglePrivateMode = usePrivateModeStore(s => s.toggle);
  const hasOfflineContent = useReactiveOfflineBrowseContext().capabilities.manualPins;

  const go = (to: string, state?: unknown) => {
    onClose();
    navigate(to, state === undefined ? undefined : { state });
  };

  const statusText = connStatus === 'connected'
    ? `${t('connection.connected')} · ${isLan ? 'LAN' : t('connection.extern')}`
    : connStatus === 'checking' ? t('connection.checking') : t('connection.disconnected');

  return (
    <MobileSheet title={t('settings.servers')} onClose={onClose} className="mobile-sheet--profile">
      <button type="button" className="mobile-server-card" onClick={() => go('/settings', { tab: 'servers' })}>
        <span className="mobile-server-card__icon"><Server size={24} strokeWidth={1.8} aria-hidden="true" /></span>
        <span className="mobile-server-card__text">
          <span className="mobile-server-card__name">{serverName}</span>
          <span className="mobile-server-card__status">
            <span className="mobile-status-dot" data-status={connStatus} aria-hidden="true" />
            {statusText}
          </span>
        </span>
        <ChevronRight className="mobile-list-row__chevron" size={18} aria-hidden="true" />
      </button>

      <div className="mobile-list-group">
        <SheetRow icon={BarChart3} label={t('sidebar.statistics')} onClick={() => go('/statistics')} />
        {hasOfflineContent && (
          <SheetRow icon={HardDriveDownload} label={t('sidebar.offlineLibrary')} onClick={() => go('/offline')} />
        )}
        <div className="mobile-list-row">
          <EyeOff className="mobile-list-row__icon" size={22} strokeWidth={1.9} aria-hidden="true" />
          <span className="mobile-list-row__label" id="mobile-private-mode-label">{t('privateMode.label')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={privateMode}
            aria-labelledby="mobile-private-mode-label"
            className="mobile-switch"
            onClick={togglePrivateMode}
          >
            <span className="mobile-switch__thumb" />
          </button>
        </div>
      </div>

      <div className="mobile-list-group">
        <SheetRow icon={Settings} label={t('sidebar.settings')} onClick={() => go('/settings')} />
        <SheetRow icon={Sparkles} label={t('whatsNew.title')} onClick={() => go('/whats-new')} />
        <SheetRow icon={HelpCircle} label={t('sidebar.help')} onClick={() => go('/help')} />
      </div>

      <div className="mobile-profile-brand">
        <PsysonicLogo className="mobile-profile-brand__logo" gradientIdSuffix="mobile-profile" />
        <span className="mobile-profile-brand__version">{appVersion}</span>
      </div>
    </MobileSheet>
  );
}
