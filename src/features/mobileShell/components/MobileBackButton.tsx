import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft } from 'lucide-react';
import { useMobileBack } from '@/features/mobileShell/hooks/useMobileBack';
import { activeMobileTab, MOBILE_TAB_LABEL_KEYS } from '@/features/mobileShell/utils/mobileTabs';

/**
 * Glass back button. `pill` shows the parent tab's name ("‹ Library"),
 * `round` is the bare chevron used over detail heroes.
 */
export default function MobileBackButton({ variant = 'pill' }: { variant?: 'pill' | 'round' }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const goBack = useMobileBack();
  const tab = activeMobileTab(pathname);
  const label = tab ? t(MOBILE_TAB_LABEL_KEYS[tab]) : t('common.back');

  if (variant === 'round') {
    return (
      <button type="button" className="mobile-round-btn" onClick={goBack} aria-label={t('common.back')}>
        <ChevronLeft size={24} strokeWidth={2.4} aria-hidden="true" />
      </button>
    );
  }
  return (
    <button type="button" className="mobile-back-pill" onClick={goBack}>
      <ChevronLeft size={21} strokeWidth={2.4} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
