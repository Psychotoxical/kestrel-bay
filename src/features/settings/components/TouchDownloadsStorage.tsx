import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { cancelAllOfflinePins, useOfflineStore } from '@/features/offline';
import { getMediaTierSize } from '@/lib/api/syncfs';
import { formatBytes } from '@/lib/format/formatBytes';
import { getMediaDir } from '@/lib/media/mediaDir';
import { useAuthStore } from '@/store/authStore';
import { useConfirmModalStore } from '@/store/confirmModalStore';
import { useLocalPlaybackStore } from '@/store/localPlaybackStore';
import { SettingsGroup } from '@/features/settings/components/SettingsGroup';
import { SettingsSubCard, SettingsField } from '@/features/settings/components/SettingsSubCard';

/**
 * Touch shell: how much space the downloaded music takes on this device, and
 * removing all of it (every server, running downloads included).
 */
export default function TouchDownloadsStorage() {
  const { t } = useTranslation();
  const [bytes, setBytes] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  // Re-measure whenever a download lands or goes.
  const pinnedCount = useLocalPlaybackStore(s => s.listPinnedGroups().length);

  const refresh = useCallback(() => {
    getMediaTierSize({ tier: 'library', mediaDir: getMediaDir() })
      .then(setBytes)
      .catch(() => setBytes(0));
  }, []);

  useEffect(() => { refresh(); }, [refresh, pinnedCount]);

  const removeAll = async () => {
    const confirmed = await useConfirmModalStore.getState().request({
      title: t('connection.removeAllDownloadsTitle'),
      message: t('connection.removeAllDownloadsMessage'),
      confirmLabel: t('connection.removeAllDownloads'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (!confirmed) return;
    setRemoving(true);
    try {
      cancelAllOfflinePins();
      for (const server of useAuthStore.getState().servers) {
        await useOfflineStore.getState().clearAll(server.id);
      }
    } finally {
      setRemoving(false);
      refresh();
    }
  };

  return (
    <div className="settings-card">
      <SettingsGroup>
        <SettingsSubCard>
          <SettingsField>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              {bytes === null ? '…' : t('connection.downloadsUsage', { size: formatBytes(bytes) })}
            </span>
          </SettingsField>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: 'var(--danger)', alignSelf: 'flex-start' }}
            disabled={removing || !bytes}
            onClick={() => { void removeAll(); }}
          >
            <Trash2 size={14} /> {t('connection.removeAllDownloads')}
          </button>
        </SettingsSubCard>
      </SettingsGroup>
    </div>
  );
}
