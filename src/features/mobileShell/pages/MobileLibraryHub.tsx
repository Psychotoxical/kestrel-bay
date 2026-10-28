import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlarmClock, ChevronRight, HardDriveDownload, Search, type LucideIcon } from 'lucide-react';
import { useMobileNavItems } from '@/features/sidebar';
import { requestOpenSearch } from '@/lib/dom/openSearch';
import { NOT_IN_TOUCH_LIBRARY as NOT_IN_LIBRARY } from '@/config/navItems';
import { IS_ANDROID } from '@/lib/util/platform';
import { ANDROID_ALARM_AVAILABLE } from '@/features/mobileShell/alarm/alarmAvailability';
import { nextAlarmTime, useAlarmStore } from '@/features/mobileShell/alarm/alarmStore';
import { alarmClock } from '@/features/mobileShell/alarm/alarmFormat';

function HubRow({ icon: Icon, label, detail, onClick }: {
  icon: LucideIcon; label: string; detail?: string; onClick: () => void;
}) {
  return (
    <button type="button" className="mobile-list-row mobile-list-row--plain" onClick={onClick}>
      <Icon className="mobile-list-row__icon" size={24} strokeWidth={1.8} aria-hidden="true" />
      <span className="mobile-list-row__label">{label}</span>
      {detail && <span className="mobile-list-row__detail">{detail}</span>}
      <ChevronRight className="mobile-list-row__chevron" size={18} aria-hidden="true" />
    </button>
  );
}

/**
 * Library tab root: Downloaded first (always, as music apps keep it), then
 * every browse page from the user's sidebar, in sidebar order.
 */
export default function MobileLibraryHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { items } = useMobileNavItems(NOT_IN_LIBRARY);
  // Android: the music alarm, with the next one that rings (Frank 21.10.).
  const nextAlarm = useAlarmStore(s => s.alarms
    .map(alarm => ({ alarm, at: nextAlarmTime(alarm) }))
    .filter(entry => entry.at)
    .sort((a, b) => a.at!.getTime() - b.at!.getTime())[0]?.alarm);

  return (
    <div className="mobile-page">
      <h1 className="mobile-large-title">{t('sidebar.library')}</h1>
      <button type="button" className="mobile-search-field" onClick={() => requestOpenSearch()}>
        <Search size={18} aria-hidden="true" />
        <span>{t('search.title')}</span>
      </button>
      <nav className="mobile-hub-list" aria-label={t('sidebar.library')}>
        <HubRow icon={HardDriveDownload} label={t('connection.downloaded')} onClick={() => navigate('/offline')} />
        {IS_ANDROID && ANDROID_ALARM_AVAILABLE && (
          <HubRow
            icon={AlarmClock}
            label={t('alarm.titlePlural')}
            detail={nextAlarm ? alarmClock(nextAlarm) : undefined}
            onClick={() => navigate('/alarm')}
          />
        )}
        {items.map(item => (
          <HubRow
            key={item.to}
            icon={item.icon as LucideIcon}
            label={t(item.labelKey, { defaultValue: item.defaultLabel })}
            onClick={() => navigate(item.to)}
          />
        ))}
      </nav>
    </div>
  );
}
