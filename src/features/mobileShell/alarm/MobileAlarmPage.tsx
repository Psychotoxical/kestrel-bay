import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Music, Plus, Sparkles, Shuffle, Heart, ShieldAlert } from 'lucide-react';
import { newAlarm, useAlarmStore, type Alarm } from './alarmStore';
import { alarmClock, repeatSummary, ringsIn, sourceLabel, weekdayNames } from './alarmFormat';
import { alarmStatus, fixAlarmStatus, type AlarmStatus } from './androidAlarm';
import AlarmEditSheet from './AlarmEditSheet';
import AlarmSetupSheet from './AlarmSetupSheet';
import { ALARM_SETUP_STEPS, missingAlarmSetup } from './alarmSetup';

const SOURCE_ICON = { luckymix: Sparkles, random: Shuffle, favorites: Heart, playlist: Music } as const;
/** How often the page asks Android which permissions are still missing. */
const STATUS_POLL_MS = 2000;

/**
 * ⚠️ Android territory. The alarms, as big time cards (Frank 21.10.): time, repeat days,
 * on/off and what plays; a tap opens the edit sheet. Above them, while the phone still lacks
 * a permission, a banner that opens the setup checklist (AlarmSetupSheet).
 */
export default function MobileAlarmPage() {
  const { t, i18n } = useTranslation();
  const alarms = useAlarmStore(s => s.alarms);
  const { save, remove, setEnabled } = useAlarmStore.getState();
  const [editing, setEditing] = useState<{ alarm: Alarm; isNew: boolean } | null>(null);
  const [status, setStatus] = useState<AlarmStatus | null>(() => alarmStatus());
  const [setupOpen, setSetupOpen] = useState(false);
  const [, setTick] = useState(0);

  // Permissions change in the system settings: look again when the page comes back, and
  // every few seconds while it shows, so a granted step disappears on its own (Frank 21.10.).
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return;
      const next = alarmStatus();
      setStatus(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    const poll = setInterval(refresh, STATUS_POLL_MS);
    const minute = setInterval(() => setTick(n => n + 1), 30_000);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
      clearInterval(poll);
      clearInterval(minute);
    };
  }, []);

  const missing = missingAlarmSetup(status);
  const days = weekdayNames(i18n.language);

  return (
    <div className="mobile-page alarm-page">
      <div className="alarm-page__head">
        <h1 className="mobile-large-title">{t('alarm.titlePlural')}</h1>
        <button
          type="button"
          className="mobile-icon-btn"
          aria-label={t('alarm.add')}
          onClick={() => setEditing({ alarm: newAlarm(crypto.randomUUID()), isNew: true })}
        >
          <Plus size={24} aria-hidden="true" />
        </button>
      </div>

      {alarms.length > 0 && missing.length > 0 && (
        <section className="alarm-setup-banner" aria-labelledby="alarm-setup-banner-title">
          <ShieldAlert className="alarm-setup-banner__icon" size={28} aria-hidden="true" />
          <div className="alarm-setup-banner__text">
            <h2 id="alarm-setup-banner-title" className="alarm-setup-banner__title">{t('alarm.setupBannerTitle')}</h2>
            <p className="alarm-setup-banner__count">
              {t('alarm.setupBannerCount', { count: missing.length, total: ALARM_SETUP_STEPS.length })}
            </p>
          </div>
          <button type="button" className="alarm-setup-banner__btn" onClick={() => setSetupOpen(true)}>
            {t('alarm.setupStart')}
          </button>
        </section>
      )}

      {alarms.length === 0 ? (
        <p className="alarm-page__empty">{t('alarm.empty')}</p>
      ) : (
        <ul className="alarm-list">
          {alarms.map(alarm => {
            const Icon = SOURCE_ICON[alarm.source.kind];
            const next = ringsIn(alarm, t);
            return (
              <li key={alarm.id} className={`alarm-card${alarm.enabled ? '' : ' is-off'}`}>
                <button type="button" className="alarm-card__body" onClick={() => setEditing({ alarm, isNew: false })}>
                  <span className="alarm-card__time">{alarmClock(alarm)}</span>
                  <span className="alarm-card__days" aria-label={repeatSummary(alarm.days, t, i18n.language)}>
                    {alarm.days.length === 0
                      ? t('alarm.once')
                      : days.map((name, i) => (
                        <span key={i} className={alarm.days.includes(i + 1) ? 'is-on' : undefined} aria-hidden="true">{name}</span>
                      ))}
                  </span>
                  <span className="alarm-card__source">
                    <Icon size={14} aria-hidden="true" />
                    {alarm.label ? `${alarm.label} · ` : ''}{sourceLabel(alarm, t)}
                  </span>
                  {next && <span className="alarm-card__next">{next}</span>}
                </button>
                <label className="toggle-switch alarm-card__toggle" aria-label={alarmClock(alarm)}>
                  <input type="checkbox" checked={alarm.enabled} onChange={e => setEnabled(alarm.id, e.target.checked)} />
                  <span className="toggle-track" />
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {setupOpen && status && missing.length > 0 && (
        <AlarmSetupSheet status={status} onClose={() => setSetupOpen(false)} />
      )}

      {editing && (
        <AlarmEditSheet
          alarm={editing.alarm}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onDelete={() => { remove(editing.alarm.id); setEditing(null); }}
          onSave={alarm => {
            save(alarm);
            setEditing(null);
            // A first alarm asks for notifications right away: without them it cannot show.
            if (status && !status.notifications) fixAlarmStatus('notifications');
          }}
        />
      )}
    </div>
  );
}
