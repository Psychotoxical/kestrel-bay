import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, HardDriveDownload, Search, type LucideIcon } from 'lucide-react';
import { useMobileNavItems } from '@/features/sidebar';
import { requestOpenSearch } from '@/lib/dom/openSearch';
import { NOT_IN_TOUCH_LIBRARY as NOT_IN_LIBRARY } from '@/config/navItems';

function HubRow({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" className="mobile-list-row mobile-list-row--plain" onClick={onClick}>
      <Icon className="mobile-list-row__icon" size={24} strokeWidth={1.8} aria-hidden="true" />
      <span className="mobile-list-row__label">{label}</span>
      <ChevronRight className="mobile-list-row__chevron" size={18} aria-hidden="true" />
    </button>
  );
}

/** Library tab root: every browse page from the user's sidebar, in sidebar order. */
export default function MobileLibraryHub() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { items, hasOfflineContent } = useMobileNavItems(NOT_IN_LIBRARY);

  return (
    <div className="mobile-page">
      <h1 className="mobile-large-title">{t('sidebar.library')}</h1>
      <button type="button" className="mobile-search-field" onClick={() => requestOpenSearch()}>
        <Search size={18} aria-hidden="true" />
        <span>{t('search.title')}</span>
      </button>
      <nav className="mobile-hub-list" aria-label={t('sidebar.library')}>
        {items.map(item => (
          <HubRow
            key={item.to}
            icon={item.icon as LucideIcon}
            label={t(item.labelKey, { defaultValue: item.defaultLabel })}
            onClick={() => navigate(item.to)}
          />
        ))}
        {hasOfflineContent && (
          <HubRow icon={HardDriveDownload} label={t('sidebar.offlineLibrary')} onClick={() => navigate('/offline')} />
        )}
      </nav>
    </div>
  );
}
