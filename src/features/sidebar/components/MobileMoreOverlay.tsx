import { createPortal } from 'react-dom';
import { NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Settings, HardDriveDownload } from 'lucide-react';
import { useMobileNavItems } from '@/features/sidebar/hooks/useMobileNavItems';

const BOTTOM_NAV_ROUTES = new Set(['/', '/albums', '/now-playing']);

export default function MobileMoreOverlay({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { items, hasOfflineContent } = useMobileNavItems(BOTTOM_NAV_ROUTES);

  return createPortal(
    <>
      <div className="mobile-more-backdrop" onClick={onClose} />
      <div className="mobile-more-sheet">
        <div className="mobile-more-handle" />
        <div className="mobile-more-grid">
          {items.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `mobile-more-item${isActive ? ' active' : ''}`}
              onClick={onClose}
            >
              <span className="mobile-more-icon"><item.icon size={24} /></span>
              <span className="mobile-more-label">{t(item.labelKey, { defaultValue: item.defaultLabel })}</span>
            </NavLink>
          ))}
          {hasOfflineContent && (
            <NavLink
              to="/offline"
              className={({ isActive }) => `mobile-more-item${isActive ? ' active' : ''}`}
              onClick={onClose}
            >
              <span className="mobile-more-icon"><HardDriveDownload size={24} /></span>
              <span className="mobile-more-label">{t('sidebar.offlineLibrary')}</span>
            </NavLink>
          )}
          <NavLink
            to="/settings"
            className={({ isActive }) => `mobile-more-item${isActive ? ' active' : ''}`}
            onClick={onClose}
          >
            <span className="mobile-more-icon"><Settings size={24} /></span>
            <span className="mobile-more-label">{t('sidebar.settings')}</span>
          </NavLink>
        </div>
      </div>
    </>,
    document.body
  );
}
