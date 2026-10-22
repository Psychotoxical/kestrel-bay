import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ChevronRight, Download, ExternalLink, Globe, HardDrive, Info, Sliders } from 'lucide-react';
import { version as appVersion } from '@/../package.json';
import i18n from '@/lib/i18n';
import { openExternalUrl as openUrl } from '@/lib/api/externalLink';
import { useAuthStore } from '@/store/authStore';
import type { ClockFormat, DebugLoggingDepth, LoggingMode } from '@/store/authStoreTypes';
import { MobileSheet } from '@/features/mobileShell';
import { useMobileActionSheetStore } from '@/features/mobileShell/store/mobileActionSheetStore';
import SettingsSubSection from '@/features/settings/components/SettingsSubSection';
import LicensesPanel from '@/features/settings/components/LicensesPanel';
import { BackupSection } from '@/features/settings/components/BackupSection';

type Option = { value: string; label: string };

/**
 * Touch shell: Settings → System as grouped rows. Choices open the action
 * sheet; credits and licenses open as sheets of their own. Same settings as
 * the desktop tab, which `SystemTab` renders everywhere else.
 */
export function SystemTouchView({
  languageOptions,
  contributors,
  onExportLogs,
}: {
  languageOptions: Option[];
  contributors: ReactNode;
  onExportLogs: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const clockFormat = useAuthStore(s => s.clockFormat);
  const setClockFormat = useAuthStore(s => s.setClockFormat);
  const loggingMode = useAuthStore(s => s.loggingMode);
  const setLoggingMode = useAuthStore(s => s.setLoggingMode);
  const debugLoggingDepth = useAuthStore(s => s.debugLoggingDepth);
  const setDebugLoggingDepth = useAuthStore(s => s.setDebugLoggingDepth);
  const [sheet, setSheet] = useState<'contributors' | 'licenses' | null>(null);

  const clockOptions: Option[] = [
    { value: 'auto', label: t('settings.clockFormatAuto') },
    { value: '24h', label: t('settings.clockFormatTwentyFour') },
    { value: '12h', label: t('settings.clockFormatTwelve') },
  ];
  const loggingOptions: Option[] = [
    { value: 'off', label: t('settings.loggingModeOff') },
    { value: 'normal', label: t('settings.loggingModeNormal') },
    { value: 'debug', label: t('settings.loggingModeDebug') },
  ];
  const depthOptions: Option[] = [{ value: '1', label: '1' }, { value: '3', label: '3' }];
  const labelOf = (options: Option[], value: string) => options.find(o => o.value === value)?.label ?? value;

  const choose = async (title: string, options: Option[], current: string, apply: (v: string) => void) => {
    const choice = await useMobileActionSheetStore.getState().request({
      title,
      actions: options.map(o => ({ id: o.value, label: o.label, primary: o.value === current })),
    });
    if (choice !== null) apply(choice);
  };

  const pickRow = (label: string, value: string, onClick: () => void) => (
    <button type="button" className="mobile-list-row" onClick={onClick}>
      <span className="mobile-list-row__label">{label}</span>
      <span className="mobile-list-row__detail">{value}</span>
      <ChevronRight size={16} className="mobile-list-row__chevron" aria-hidden="true" />
    </button>
  );

  return (
    <>
      <SettingsSubSection title={t('settings.behavior')} icon={<Globe size={16} />}>
        <div className="mobile-list-group">
          {pickRow(t('settings.language'), labelOf(languageOptions, i18n.language), () => void choose(
            t('settings.language'), languageOptions, i18n.language, v => void i18n.changeLanguage(v),
          ))}
          {pickRow(t('settings.clockFormat'), labelOf(clockOptions, clockFormat), () => void choose(
            t('settings.clockFormat'), clockOptions, clockFormat, v => setClockFormat(v as ClockFormat),
          ))}
        </div>
      </SettingsSubSection>

      <SettingsSubSection title={t('settings.backupTitle')} icon={<HardDrive size={16} />}>
        <BackupSection />
      </SettingsSubSection>

      <SettingsSubSection title={t('settings.loggingTitle')} icon={<Sliders size={16} />}>
        <div className="touch-cache">
          <div className="touch-cache__block">
            <div className="mobile-list-group">
              {pickRow(t('settings.loggingTitle'), labelOf(loggingOptions, loggingMode), () => void choose(
                t('settings.loggingTitle'), loggingOptions, loggingMode, v => setLoggingMode(v as LoggingMode),
              ))}
              {loggingMode === 'debug' && pickRow(
                t('settings.debugLoggingDepth'),
                String(debugLoggingDepth),
                () => void choose(
                  t('settings.debugLoggingDepth'), depthOptions, String(debugLoggingDepth),
                  v => setDebugLoggingDepth(Number(v) as DebugLoggingDepth),
                ),
              )}
              {loggingMode !== 'off' && (
                <button type="button" className="mobile-list-row" onClick={() => void onExportLogs()}>
                  <span className="mobile-list-row__icon" aria-hidden="true"><Download size={18} /></span>
                  <span className="mobile-list-row__label">{t('settings.loggingExport')}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </SettingsSubSection>

      <SettingsSubSection title={t('settings.aboutTitle')} icon={<Info size={16} />}>
        <div className="mobile-list-group">
          <div className="mobile-list-row">
            <span className="mobile-list-row__label">{t('settings.aboutVersion')}</span>
            <span className="mobile-list-row__detail">{appVersion}</span>
          </div>
          <button
            type="button"
            className="mobile-list-row"
            onClick={() => {
              useAuthStore.getState().setLastSeenChangelogVersion('');
              navigate('/whats-new');
            }}
          >
            <span className="mobile-list-row__label">{t('settings.aboutReleaseNotesLink')}</span>
            <ChevronRight size={16} className="mobile-list-row__chevron" aria-hidden="true" />
          </button>
          <button type="button" className="mobile-list-row" onClick={() => setSheet('contributors')}>
            <span className="mobile-list-row__label">{t('settings.aboutContributorsLabel')}</span>
            <ChevronRight size={16} className="mobile-list-row__chevron" aria-hidden="true" />
          </button>
          <button type="button" className="mobile-list-row" onClick={() => setSheet('licenses')}>
            <span className="mobile-list-row__label">{t('licenses.title')}</span>
            <ChevronRight size={16} className="mobile-list-row__chevron" aria-hidden="true" />
          </button>
          <button type="button" className="mobile-list-row" onClick={() => openUrl('https://github.com/Psysonic/psysonic')}>
            <span className="mobile-list-row__label">{t('settings.aboutRepo')}</span>
            <ExternalLink size={16} className="mobile-list-row__chevron" aria-hidden="true" />
          </button>
        </div>
      </SettingsSubSection>

      {sheet === 'contributors' && (
        <MobileSheet title={t('settings.aboutContributorsLabel')} onClose={() => setSheet(null)} className="mobile-sheet--system">
          {contributors}
        </MobileSheet>
      )}
      {sheet === 'licenses' && (
        <MobileSheet title={t('licenses.title')} onClose={() => setSheet(null)} className="mobile-sheet--system">
          <LicensesPanel />
        </MobileSheet>
      )}
    </>
  );
}
