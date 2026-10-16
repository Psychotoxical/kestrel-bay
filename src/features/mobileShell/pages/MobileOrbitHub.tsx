import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, LogIn, Plus } from 'lucide-react';
import {
  OrbitWordmark,
  useHelpModalStore,
  useOrbitStore,
} from '@/features/orbit';
import MobileOrbitRoom from '@/features/mobileShell/components/MobileOrbitRoom';
import MobileOrbitStartSheet from '@/features/mobileShell/components/MobileOrbitStartSheet';
import MobileOrbitJoinSheet from '@/features/mobileShell/components/MobileOrbitJoinSheet';

/**
 * Orbit tab root. Without a session: create / join / help. In a session it is
 * the session room (MobileOrbitRoom): head with the session controls, and the
 * shared queue right below.
 */
export default function MobileOrbitHub() {
  const { t } = useTranslation();
  const role = useOrbitStore(s => s.role);
  const [startOpen, setStartOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <div className="mobile-page mobile-orbit-hub">
      {/* In a session the room's head names it; the wordmark stays for VoiceOver only. */}
      <h1 className={role === null ? 'mobile-large-title mobile-orbit-hub__title' : 'mobile-visually-hidden'}>
        <OrbitWordmark height={30} />
        <span className="mobile-visually-hidden">{t('orbit.triggerLabel')}</span>
      </h1>

      {role === null ? (
        <>
          <p className="mobile-orbit-hub__intro">{t('orbit.helpIntro')}</p>
          <div className="mobile-list-group">
            <button type="button" className="mobile-list-row" onClick={() => setStartOpen(true)}>
              <Plus className="mobile-list-row__icon" size={22} aria-hidden="true" />
              <span className="mobile-list-row__label">{t('orbit.launchCreate')}</span>
            </button>
            <button type="button" className="mobile-list-row" onClick={() => setJoinOpen(true)}>
              <LogIn className="mobile-list-row__icon" size={22} aria-hidden="true" />
              <span className="mobile-list-row__label">{t('orbit.launchJoin')}</span>
            </button>
            <button type="button" className="mobile-list-row" onClick={() => useHelpModalStore.getState().open()}>
              <HelpCircle className="mobile-list-row__icon" size={22} aria-hidden="true" />
              <span className="mobile-list-row__label">{t('orbit.launchHelp')}</span>
            </button>
          </div>
        </>
      ) : (
        <MobileOrbitRoom />
      )}

      {startOpen && <MobileOrbitStartSheet onClose={() => setStartOpen(false)} />}
      {joinOpen && <MobileOrbitJoinSheet onClose={() => setJoinOpen(false)} />}
    </div>
  );
}
