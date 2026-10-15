import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { EyeOff, Shuffle, TrendingUp, UserRound } from 'lucide-react';
import PsysonicLogo from '@/ui/PsysonicLogo';
import { useAuthStore } from '@/store/authStore';
import { usePrivateModeStore } from '@/features/privateMode';
import type { ConnectionStatus } from '@/lib/hooks/useConnectionStatus';
import MobileProfileSheet from '@/features/mobileShell/components/MobileProfileSheet';
import MobileBackButton from '@/features/mobileShell/components/MobileBackButton';
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
  const [profileOpen, setProfileOpen] = useState(false);
  const mixHub = randomNavMode === 'hub';
  const mixRoute = mixHub ? '/random' : '/random/mix';

  return (
    <header className="mobile-mainstage-header">
      <div className="mobile-mainstage-header__brand">
        <PsysonicLogo className="mobile-mainstage-header__logo" gradientIdSuffix="mobile-mainstage" />
        {serverName && (
          <span className="mobile-server-chip">
            <span className="mobile-status-dot" data-status={connStatus} aria-hidden="true" />
            <span className="mobile-server-chip__name">{serverName}</span>
          </span>
        )}
        <span className="mobile-mainstage-header__spacer" />
        {privateMode && (
          <span className="mobile-round-btn mobile-round-btn--flag" role="img" aria-label={t('privateMode.label')}>
            <EyeOff size={19} aria-hidden="true" />
          </span>
        )}
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
