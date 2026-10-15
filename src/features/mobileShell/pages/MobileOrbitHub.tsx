import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle, LogIn, Plus } from 'lucide-react';
import {
  OrbitGuestQueue,
  OrbitJoinModal,
  OrbitQueueHead,
  OrbitStartModal,
  OrbitWordmark,
  useOrbitStore,
} from '@/features/orbit';
import HostApprovalQueue from '@/features/orbit/components/HostApprovalQueue';
import { useHelpModalStore } from '@/features/orbit/store/helpModalStore';

/**
 * Orbit tab root. Without a session: create / join / help. In a session the
 * session bar sits above every page; this tab adds the host's queue head and
 * approval list, or the guest queue.
 */
export default function MobileOrbitHub() {
  const { t } = useTranslation();
  const role = useOrbitStore(s => s.role);
  const state = useOrbitStore(s => s.state);
  const [startOpen, setStartOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  return (
    <div className="mobile-page mobile-orbit-hub">
      <h1 className="mobile-large-title mobile-orbit-hub__title">
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
      ) : role === 'guest' ? (
        <div className="mobile-orbit-hub__panel"><OrbitGuestQueue /></div>
      ) : (
        <div className="mobile-orbit-hub__panel">
          {state && <OrbitQueueHead state={state} />}
          <HostApprovalQueue />
        </div>
      )}

      {startOpen && <OrbitStartModal onClose={() => setStartOpen(false)} />}
      {joinOpen && <OrbitJoinModal onClose={() => setJoinOpen(false)} />}
    </div>
  );
}
