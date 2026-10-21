import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';
import { openExternalUrl } from '@/lib/api/externalLink';
import { fixAlarmStatus, type AlarmStatus } from './androidAlarm';
import { ALARM_SETUP_STEPS } from './alarmSetup';

/** Per-maker settings that keep apps alive (Asra, 21.10.). */
const DONT_KILL_MY_APP = 'https://dontkillmyapp.com/';

interface Props {
  status: AlarmStatus;
  onClose: () => void;
}

/**
 * ⚠️ Android territory. Everything the alarm needs from the phone as a checklist (Frank
 * 21.10.: clear even for someone who has never seen a permission page): a sentence why and
 * a big "Allow" button per step. Android opens its own page for each; a step the user has
 * granted leaves the list, and the sheet closes once none is left (the page polls).
 */
export default function AlarmSetupSheet({ status, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <MobileSheet title={t('alarm.setupSheetTitle')} onClose={onClose} className="mobile-sheet--alarm-setup">
      <p className="alarm-setup-sheet__intro">{t('alarm.setupIntro')}</p>
      <ul className="alarm-setup-list">
        {ALARM_SETUP_STEPS.filter(({ key }) => status[key] === false).map(({ key, icon: Icon }) => {
          return (
            <li key={key} className="alarm-setup-step">
              <span className="alarm-setup-step__icon"><Icon size={22} aria-hidden="true" /></span>
              <span className="alarm-setup-step__text">
                <span className="alarm-setup-step__title">{t(`alarm.step_${key}`)}</span>
                <span className="alarm-setup-step__why">{t(`alarm.step_${key}_why`)}</span>
                {key === 'battery' && (
                  <button
                    type="button"
                    className="alarm-setup-step__more"
                    onClick={() => { void openExternalUrl(DONT_KILL_MY_APP).catch(() => {}); }}
                  >
                    {t('alarm.setupMoreForPhone')} <ExternalLink size={13} aria-hidden="true" />
                  </button>
                )}
              </span>
              <button type="button" className="alarm-setup-step__allow" onClick={() => fixAlarmStatus(key)}>
                {t('alarm.setupAllow')}
              </button>
            </li>
          );
        })}
      </ul>
    </MobileSheet>
  );
}
