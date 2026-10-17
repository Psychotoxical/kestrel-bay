import { HardDrive } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import {
  useFavoritesOfflineStatus,
  type FavoritesOfflineSemaphore,
} from '@/features/favorites/hooks/useFavoritesOfflineStatus';
import {
  disableFavoritesOfflineSync,
  scheduleFavoritesOfflineSync,
} from '@/features/offline';

const SEMAPHORE_KEYS: Record<FavoritesOfflineSemaphore, string> = {
  red: 'favorites.offlineSemaphoreError',
  yellow: 'favorites.offlineSemaphoreSyncing',
  green: 'favorites.offlineSemaphoreSynced',
};

/**
 * Touch shell: saving favorites for offline listening as a labelled switch row,
 * as in the profile sheet; the sync state reads as a line under the label.
 */
export default function FavoritesOfflineRow() {
  const { t } = useTranslation();
  const setEnabled = useAuthStore(s => s.setFavoritesOfflineEnabled);
  const { enabled, semaphore, savedCount, targetCount } = useFavoritesOfflineStatus();

  const toggle = async () => {
    if (enabled) {
      await disableFavoritesOfflineSync();
    } else {
      setEnabled(true);
      scheduleFavoritesOfflineSync();
    }
  };

  return (
    <div className="mobile-list-group">
      <div className="mobile-list-row mobile-list-row--wrap">
        <HardDrive className="mobile-list-row__icon" size={22} strokeWidth={1.9} aria-hidden="true" />
        <span className="mobile-list-row__text">
          <span className="mobile-list-row__label" id="mobile-favorites-offline-label">
            {t('favorites.offlineTooltip')}
          </span>
          {enabled && semaphore && (
            <span className="mobile-list-row__detail" role="status" aria-live="polite">
              {t(SEMAPHORE_KEYS[semaphore], { saved: savedCount, total: targetCount })}
            </span>
          )}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-labelledby="mobile-favorites-offline-label"
          className="mobile-switch"
          onClick={() => void toggle()}
        >
          <span className="mobile-switch__thumb" />
        </button>
      </div>
    </div>
  );
}
