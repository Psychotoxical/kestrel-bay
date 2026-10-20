import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Download, FolderOpen, HardDriveDownload, Trash2, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { countHotCacheTracks } from '@/features/playback/store/hotCacheStore';
import { useLocalPlaybackStore } from '@/store/localPlaybackStore';
import { getMediaTierSize } from '@/lib/api/syncfs';
import { formatBytes, snapHotCacheMb } from '@/lib/format/formatBytes';
import SettingsSubSection from '@/features/settings/components/SettingsSubSection';
import DesktopOnly from '@/features/settings/components/DesktopOnly';
import TouchOnly from '@/features/settings/components/TouchOnly';
import TouchDownloadsStorage from '@/features/settings/components/TouchDownloadsStorage';
import { SettingsGroup } from '@/features/settings/components/SettingsGroup';
import { SettingsToggle } from '@/features/settings/components/SettingsToggle';
import { SettingsSubCard, SettingsField, SettingsValue } from '@/features/settings/components/SettingsSubCard';
import CoverCacheStrategySection from '@/features/settings/components/CoverCacheStrategySection';

export function StorageTab() {
  const { t } = useTranslation();
  const auth = useAuthStore();
  const clearHotCacheDisk = useLocalPlaybackStore(s => s.purgeEphemeralDisk);
  const localPlaybackEntries = useLocalPlaybackStore(s => s.entries);
  const [hotCacheBytes, setHotCacheBytes] = useState<number | null>(null);

  const mediaDir = auth.mediaDir || null;

  /** Match ephemeral disk usage (all servers); resolve UUID vs URL index keys. */
  const hotCacheTrackCount = useMemo(
    () => countHotCacheTracks(localPlaybackEntries),
    [localPlaybackEntries],
  );

  const refreshHotCacheSize = useCallback(() => {
    getMediaTierSize({ tier: 'ephemeral', mediaDir })
      .then(setHotCacheBytes)
      .catch(() => setHotCacheBytes(0));
  }, [mediaDir]);

  useEffect(() => {
    refreshHotCacheSize();
  }, [refreshHotCacheSize]);

  useEffect(() => {
    if (!auth.hotCacheEnabled) return;
    refreshHotCacheSize();
    const interval = window.setInterval(refreshHotCacheSize, 15_000);
    return () => window.clearInterval(interval);
  }, [auth.hotCacheEnabled, refreshHotCacheSize]);

  useEffect(() => {
    if (!auth.hotCacheEnabled) return;
    const handle = window.setTimeout(refreshHotCacheSize, 400);
    return () => window.clearTimeout(handle);
  }, [localPlaybackEntries, auth.hotCacheEnabled, refreshHotCacheSize]);

  const pickMediaDir = async () => {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: t('settings.mediaDirChange'),
    });
    if (selected && typeof selected === 'string') {
      auth.setMediaDir(selected);
      refreshHotCacheSize();
    }
  };

  const pickDownloadFolder = async () => {
    const selected = await openDialog({ directory: true, multiple: false, title: t('settings.pickFolderTitle') });
    if (selected && typeof selected === 'string') {
      auth.setDownloadFolder(selected);
    }
  };

  const setHotCacheEnabled = async (enabled: boolean) => {
    if (!enabled) {
      await clearHotCacheDisk(mediaDir);
      setHotCacheBytes(0);
      auth.setHotCacheEnabled(false);
    } else {
      auth.setHotCacheEnabled(true);
      refreshHotCacheSize();
    }
  };

  return (
    <>
      <TouchOnly>
        <SettingsSubSection
          title={t('connection.downloadsStorageTitle')}
          icon={<HardDriveDownload size={16} />}
        >
          <TouchDownloadsStorage />
        </SettingsSubSection>
      </TouchOnly>

      <DesktopOnly>
        <SettingsSubSection
          title={t('settings.mediaDirTitle')}
          icon={<FolderOpen size={16} />}
        >
          <div className="settings-card">
            <SettingsGroup desc={t('settings.mediaDirDesc')}>
              <SettingsSubCard>
                <SettingsField note={auth.mediaDir ? t('settings.mediaDirHint') : undefined}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="input"
                      type="text"
                      readOnly
                      value={auth.mediaDir || t('settings.mediaDirDefault')}
                      style={{ flex: 1, fontSize: 13, color: auth.mediaDir ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'default' }}
                    />
                    {auth.mediaDir && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => { auth.setMediaDir(''); refreshHotCacheSize(); }}
                        data-tooltip={t('settings.mediaDirClear')}
                        style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                      >
                        <X size={16} />
                      </button>
                    )}
                    <button className="btn btn-surface" onClick={pickMediaDir} style={{ flexShrink: 0 }}>
                      <FolderOpen size={16} /> {t('settings.mediaDirChange')}
                    </button>
                  </div>
                </SettingsField>
              </SettingsSubCard>
            </SettingsGroup>
          </div>
        </SettingsSubSection>
      </DesktopOnly>

      <CoverCacheStrategySection />

      <DesktopOnly>
        <SettingsSubSection
          title={t('settings.nextTrackBufferingTitle')}
          icon={<Download size={16} />}
        >
          <div className="settings-card">
            <SettingsGroup>
              <SettingsToggle
                label={t('settings.hotCacheTitle')}
                desc={t('settings.hotCacheDisclaimer')}
                ariaLabel={t('settings.hotCacheEnabled')}
                id="hot-cache-enabled-toggle"
                checked={auth.hotCacheEnabled}
                onChange={setHotCacheEnabled}
              />

              {auth.hotCacheEnabled && (
                <SettingsSubCard style={{ marginTop: '0.85rem' }}>
                  <SettingsField>
                    <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{t('settings.cacheUsedHot')}</span>
                        {hotCacheBytes !== null ? formatBytes(hotCacheBytes) : '…'}
                      </div>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{t('settings.hotCacheTrackCount')}</span>
                        {hotCacheTrackCount}
                      </div>
                    </div>
                  </SettingsField>
                  <SettingsField label={t('settings.hotCacheMaxMb')} row>
                    <input type="range" min={32} max={20000} step={32} value={snapHotCacheMb(auth.hotCacheMaxMb)} onChange={e => auth.setHotCacheMaxMb(parseInt(e.target.value, 10))} id="hot-cache-max-mb-slider" />
                    <SettingsValue>{snapHotCacheMb(auth.hotCacheMaxMb)} MB</SettingsValue>
                  </SettingsField>
                  <SettingsField label={t('settings.hotCacheDebounce')} row>
                    <input type="range" min={0} max={600} step={1} value={Math.min(600, Math.max(0, auth.hotCacheDebounceSec))} onChange={e => auth.setHotCacheDebounceSec(parseInt(e.target.value, 10))} id="hot-cache-debounce-slider" />
                    <SettingsValue>
                      {Math.min(600, Math.max(0, auth.hotCacheDebounceSec)) === 0
                        ? t('settings.hotCacheDebounceImmediate')
                        : t('settings.hotCacheDebounceSeconds', { n: Math.min(600, Math.max(0, auth.hotCacheDebounceSec)) })}
                    </SettingsValue>
                  </SettingsField>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ fontSize: 13, alignSelf: 'flex-start' }}
                    onClick={async () => {
                      await clearHotCacheDisk(mediaDir);
                      refreshHotCacheSize();
                    }}
                  >
                    <Trash2 size={14} /> {t('settings.hotCacheClearBtn')}
                  </button>
                </SettingsSubCard>
              )}
            </SettingsGroup>
          </div>
        </SettingsSubSection>
      </DesktopOnly>

      <TouchOnly>
        <SettingsSubSection
          title={t('settings.nextTrackBufferingTitle')}
          icon={<Download size={16} />}
        >
          <div className="touch-cache">
            <div className="touch-cache__block">
              <div className="mobile-list-group">
                <label className="mobile-list-row" htmlFor="hot-cache-enabled-switch">
                  <span className="mobile-list-row__label">{t('settings.hotCacheTitle')}</span>
                  <span className="toggle-switch">
                    <input
                      type="checkbox"
                      id="hot-cache-enabled-switch"
                      aria-label={t('settings.hotCacheEnabled')}
                      checked={auth.hotCacheEnabled}
                      onChange={e => void setHotCacheEnabled(e.target.checked)}
                    />
                    <span className="toggle-track" />
                  </span>
                </label>
                {auth.hotCacheEnabled && (
                  <>
                    <div className="mobile-list-row">
                      <span className="mobile-list-row__label">{t('settings.touchCacheSize')}</span>
                      <span className="mobile-list-row__detail">{hotCacheBytes !== null ? formatBytes(hotCacheBytes) : '…'}</span>
                    </div>
                    <div className="mobile-list-row">
                      <span className="mobile-list-row__label">{t('settings.touchCacheTrackCount')}</span>
                      <span className="mobile-list-row__detail">{hotCacheTrackCount}</span>
                    </div>
                    <div className="mobile-list-row touch-cache__stack">
                      <div className="touch-cache__stack-top">
                        <span>{t('settings.hotCacheMaxMb')}</span>
                        <span className="mobile-list-row__detail">{snapHotCacheMb(auth.hotCacheMaxMb)} MB</span>
                      </div>
                      <input type="range" min={32} max={20000} step={32} value={snapHotCacheMb(auth.hotCacheMaxMb)} onChange={e => auth.setHotCacheMaxMb(parseInt(e.target.value, 10))} aria-label={t('settings.hotCacheMaxMb')} />
                    </div>
                    <div className="mobile-list-row touch-cache__stack">
                      <div className="touch-cache__stack-top">
                        <span>{t('settings.hotCacheDebounce')}</span>
                        <span className="mobile-list-row__detail">
                          {Math.min(600, Math.max(0, auth.hotCacheDebounceSec)) === 0
                            ? t('settings.hotCacheDebounceImmediate')
                            : t('settings.hotCacheDebounceSeconds', { n: Math.min(600, Math.max(0, auth.hotCacheDebounceSec)) })}
                        </span>
                      </div>
                      <input type="range" min={0} max={600} step={1} value={Math.min(600, Math.max(0, auth.hotCacheDebounceSec))} onChange={e => auth.setHotCacheDebounceSec(parseInt(e.target.value, 10))} aria-label={t('settings.hotCacheDebounce')} />
                    </div>
                    <button
                      type="button"
                      className="mobile-list-row touch-cache__danger"
                      onClick={async () => {
                        await clearHotCacheDisk(mediaDir);
                        refreshHotCacheSize();
                      }}
                    >
                      {t('settings.hotCacheClearBtn')}
                    </button>
                  </>
                )}
              </div>
              <p className="touch-cache__footer">{t('settings.hotCacheDisclaimer')}</p>
            </div>
          </div>
        </SettingsSubSection>
      </TouchOnly>

      <DesktopOnly>
        <SettingsSubSection
          title={t('settings.downloadsTitle')}
          icon={<FolderOpen size={16} />}
        >
          <div className="settings-card">
            <SettingsGroup desc={t('settings.downloadsFolderDesc')}>
              <SettingsSubCard>
                <SettingsField>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      className="input"
                      type="text"
                      readOnly
                      value={auth.downloadFolder || t('settings.downloadsDefault')}
                      style={{ flex: 1, fontSize: 13, color: auth.downloadFolder ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'default' }}
                    />
                    {auth.downloadFolder && (
                      <button
                        className="btn btn-ghost"
                        onClick={() => auth.setDownloadFolder('')}
                        aria-label={t('settings.clearFolder')}
                        data-tooltip={t('settings.clearFolder')}
                        style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                      >
                        <X size={16} />
                      </button>
                    )}
                    <button className="btn btn-surface" onClick={pickDownloadFolder} style={{ flexShrink: 0 }} id="settings-download-folder-btn">
                      <FolderOpen size={16} /> {t('settings.pickFolder')}
                    </button>
                  </div>
                </SettingsField>
              </SettingsSubCard>
            </SettingsGroup>
          </div>
        </SettingsSubSection>
      </DesktopOnly>
    </>
  );
}
