import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Trans, useTranslation } from 'react-i18next';
import { ChevronDown, CloudOff, EyeOff, Music2, Shuffle, TrendingUp, UserRound } from 'lucide-react';
import PsysonicLogo from '@/ui/PsysonicLogo';
import { useAuthStore } from '@/store/authStore';
import { usePrivateModeStore } from '@/features/privateMode';
import { useDevOfflineBrowseStore, useOfflineBrowseActive } from '@/features/offline';
import type { ConnectionStatus } from '@/lib/hooks/useConnectionStatus';
import MobileProfileSheet from '@/features/mobileShell/components/MobileProfileSheet';
import MobileSourceSheet from '@/features/mobileShell/components/MobileSourceSheet';
import MobileLiveButton from '@/features/mobileShell/components/MobileLiveButton';
import { useMobileSourceScope } from '@/features/mobileShell/hooks/useMobileSourceScope';
import MobileBackButton from '@/features/mobileShell/components/MobileBackButton';
import MobilePullToRefresh from '@/features/mobileShell/components/MobilePullToRefresh';
import { hasOwnMobileHeader, isMobileTabRoot } from '@/features/mobileShell/utils/mobileTabs';

interface Props {
  serverName: string;
  connStatus: ConnectionStatus;
  isLan: boolean;
}

function MainstageHeader({ serverName, connStatus, isLan }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const randomNavMode = useAuthStore(s => s.randomNavMode);
  const privateMode = usePrivateModeStore(s => s.active);
  const downloadsOnly = useDevOfflineBrowseStore(s => s.forceOffline);
  // Mix and Most Played come from the server; offline the Mainstage shows only what is on the device.
  const offline = useOfflineBrowseActive();
  const [profileOpen, setProfileOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const scope = useMobileSourceScope();
  // Nothing to choose (one server, at most one library): the chip leads to the server settings, as on desktop.
  const canChoose = scope.multiServer || scope.showLibraries;
  const openSource = () => {
    // "Downloaded music only" is switched off where it was switched on: in the profile sheet.
    if (downloadsOnly) setProfileOpen(true);
    else if (canChoose) setSourceOpen(true);
    else navigate('/settings', { state: { tab: 'servers' } });
  };
  const chipLabel = !scope.multiScope ? serverName : scope.unavailableSelection ? (
    <Trans
      i18nKey="sidebar.serverAvailabilityCount"
      values={{ total: scope.selectedServerIds.length, available: scope.effectiveServerIds.length }}
      components={{ unavailable: <del className="mobile-server-chip__unavailable" /> }}
    />
  ) : t('sidebar.serverSelectionCount', { count: scope.selectedServerIds.length });
  const mixHub = randomNavMode === 'hub';
  const mixRoute = mixHub ? '/random' : '/random/mix';

  return (
    <header className="mobile-mainstage-header">
      <MobilePullToRefresh />
      <div className="mobile-mainstage-header__brand">
        <PsysonicLogo className="mobile-mainstage-header__logo" gradientIdSuffix="mobile-mainstage" />
        {serverName && (downloadsOnly ? (
          <button
            type="button"
            className="mobile-server-chip mobile-server-chip--offline"
            aria-haspopup="dialog"
            onClick={openSource}
          >
            <CloudOff size={14} className="mobile-server-chip__icon" aria-hidden="true" />
            <span className="mobile-server-chip__name">{t('connection.offlineChip')}</span>
          </button>
        ) : (
          <button
            type="button"
            className="mobile-server-chip"
            aria-haspopup={canChoose ? 'dialog' : undefined}
            onClick={openSource}
          >
            <span className="mobile-status-dot" data-status={connStatus} aria-hidden="true" />
            <span className="mobile-server-chip__name">{chipLabel}</span>
            {scope.hasLibrarySelection && <Music2 size={12} className="mobile-server-chip__icon" aria-label={t('sidebar.libraryScope')} />}
            {canChoose && <ChevronDown size={13} className="mobile-server-chip__icon" aria-hidden="true" />}
          </button>
        ))}
        <span className="mobile-mainstage-header__spacer" />
        {privateMode && (
          <span className="mobile-round-btn mobile-round-btn--flag" role="img" aria-label={t('privateMode.label')}>
            <EyeOff size={19} aria-hidden="true" />
          </span>
        )}
        <MobileLiveButton />
        <button
          type="button"
          className="mobile-round-btn"
          aria-label={`${t('settings.servers')} · ${t('sidebar.settings')}`}
          aria-haspopup="dialog"
          onClick={() => setProfileOpen(true)}
        >
          <UserRound size={21} strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
      <h1 className="mobile-large-title">{t('sidebar.mainstage')}</h1>
      {!offline && (
        <div className="mobile-quick-cards">
          <button type="button" className="mobile-quick-card" onClick={() => navigate(mixRoute)}>
            <span className="mobile-quick-card__icon"><Shuffle size={20} aria-hidden="true" /></span>
            <span>{t(mixHub ? 'sidebar.randomPicker' : 'sidebar.randomMix')}</span>
          </button>
          <button type="button" className="mobile-quick-card" onClick={() => navigate('/most-played')}>
            <span className="mobile-quick-card__icon"><TrendingUp size={20} aria-hidden="true" /></span>
            <span>{t('sidebar.mostPlayed')}</span>
          </button>
        </div>
      )}
      {sourceOpen && <MobileSourceSheet onClose={() => setSourceOpen(false)} />}
      {profileOpen && (
        <MobileProfileSheet
          serverName={serverName}
          connStatus={connStatus}
          isLan={isLan}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </header>
  );
}

/** Route-dependent top of the scroll area: brand header on Mainstage, back bar on sub-pages. */
export default function MobileTopBar(props: Props) {
  const { pathname } = useLocation();
  if (pathname === '/') return <MainstageHeader {...props} />;
  if (isMobileTabRoot(pathname) || hasOwnMobileHeader(pathname)) return null;
  return (
    <div className="mobile-back-bar">
      <MobileBackButton />
    </div>
  );
}
