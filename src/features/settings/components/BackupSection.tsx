import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Clock3, Download, Upload } from 'lucide-react';
import { createPortal } from 'react-dom';
import { SettingsGroup } from '@/features/settings/components/SettingsGroup';
import { SettingsSubCard, SettingsField } from '@/features/settings/components/SettingsSubCard';
import {
  exportBackupToPath,
  importAnyBackupFromPath,
  pickBackupExportPath,
  pickBackupImportPath,
} from '@/features/settings/utils/backup';
import { showToast } from '@/lib/dom/toast';
import { offerExportFile } from '@/lib/util/exportFile';
import { confirmChoice } from '@/features/settings/utils/confirmChoice';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

type BackupMode = 'full' | 'library' | 'config';
type BackupAction = 'export' | 'import';

export function BackupSection() {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<BackupMode>('full');
  const [busyAction, setBusyAction] = useState<BackupAction | null>(null);

  const waitForPaint = async () => {
    await new Promise(resolve => window.setTimeout(resolve, 0));
  };

  const busy = exporting || importing;

  const exportAs = async (exportMode: BackupMode) => {
    const path = await pickBackupExportPath(exportMode);
    if (!path) return;
    setBusyAction('export');
    setExporting(true);
    try {
      await waitForPaint();
      await exportBackupToPath(exportMode, path);
      await offerExportFile(path);
      const successKey = exportMode === 'full'
        ? 'settings.backupFullExportSuccess'
        : exportMode === 'library'
          ? 'settings.backupLibraryExportSuccess'
          : 'settings.backupSuccess';
      showToast(t(successKey), 3000, 'info');
    } catch (e) {
      console.error('Export failed', e);
      const errorKey = exportMode === 'full'
        ? 'settings.backupFullImportError'
        : mode === 'library'
          ? 'settings.backupLibraryImportError'
          : 'settings.backupImportError';
      showToast(t(errorKey), 4000, 'error');
    } finally {
      setExporting(false);
      setBusyAction(null);
    }
  };

  const handleExport = () => exportAs(mode);

  const handleImport = async () => {
    const confirmed = await confirmChoice({
      title: t('settings.backupImportAny'),
      message: t('settings.backupImportAnyConfirm'),
      confirmLabel: t('settings.backupImportAny'),
      cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;
    const path = await pickBackupImportPath();
    if (!path) return;
    setBusyAction('import');
    setImporting(true);
    try {
      await waitForPaint();
      const importedKind = await importAnyBackupFromPath(path);
      if (importedKind === 'full') {
        showToast(t('settings.backupFullImportSuccess'), 3000, 'info');
      } else if (importedKind === 'databases') {
        showToast(t('settings.backupLibraryImportSuccess'), 3000, 'info');
      } else if (importedKind === 'config') {
        showToast(t('settings.backupImportSuccess'), 3000, 'info');
      }
    } catch (e) {
      console.error('Import failed', e);
      showToast(t('settings.backupImportError'), 4000, 'error');
    } finally {
      setImporting(false);
      setBusyAction(null);
    }
  };

  const modeTitle = mode === 'full'
    ? t('settings.backupModeFull')
    : mode === 'library'
      ? t('settings.backupModeLibrary')
      : t('settings.backupModeConfig');
  const modeDesc = mode === 'full'
    ? t('settings.backupFullDesc')
    : mode === 'library'
      ? t('settings.backupLibraryExportDesc')
      : t('settings.backupExportDesc');
  const exportLabel = mode === 'full'
    ? t('settings.backupFullExport')
    : mode === 'library'
      ? t('settings.backupLibraryExport')
      : t('settings.backupExport');
  const importLabel = t('settings.backupImportAny');
  const overlayTitle = busyAction === 'import'
    ? t('settings.backupOverlayImportTitle')
    : t('settings.backupOverlayExportTitle');
  const overlayHint = t('settings.backupOverlayHint');
  const busyOverlay = busy && typeof document !== 'undefined'
    ? createPortal(
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.38)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 99999,
          pointerEvents: 'all',
          boxSizing: 'border-box',
        }}
        aria-live="polite"
        aria-busy="true"
      >
        <div
          className="settings-card"
          style={{
            width: 'clamp(280px, 52vw, 560px)',
            maxWidth: 'calc(100vw - 32px)',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '999px',
              background: 'var(--surface-3)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '0.6rem',
            }}
          >
            <Clock3 size={18} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: '0.5rem' }}>{overlayTitle}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{overlayHint}</div>
        </div>
      </div>,
      document.body,
    )
    : null;

  // Touch shell: one row per backup kind instead of the mode switch.
  if (IS_MOBILE_SHELL) {
    const rows: { id: string; label: string; run: () => Promise<void> }[] = [
      { id: 'full', label: t('settings.backupFullExport'), run: () => exportAs('full') },
      { id: 'library', label: t('settings.backupLibraryExport'), run: () => exportAs('library') },
      { id: 'config', label: t('settings.backupExport'), run: () => exportAs('config') },
      { id: 'import', label: importLabel, run: handleImport },
    ];
    return (
      <div className="touch-cache">
        <div className="touch-cache__block">
          <div className="mobile-list-group">
            {rows.map(row => (
              <button
                key={row.id}
                type="button"
                className="mobile-list-row"
                disabled={busy}
                onClick={() => void row.run()}
              >
                <span className="mobile-list-row__icon" aria-hidden="true">
                  {row.id === 'import' ? <Download size={18} /> : <Upload size={18} />}
                </span>
                <span className="mobile-list-row__label">{row.label}</span>
              </button>
            ))}
          </div>
          <p className="touch-cache__footer">
            <AlertTriangle size={12} aria-hidden="true" /> {t('settings.backupCredentialsNoticeBody')}
          </p>
        </div>
        {busyOverlay}
      </div>
    );
  }

  return (
    <div className="settings-card">
      <SettingsGroup>
        <div className="settings-segmented" style={{ marginBottom: '0.85rem' }}>
          {(['full', 'library', 'config'] as BackupMode[]).map(candidate => (
            <button
              key={candidate}
              type="button"
              className={`btn ${mode === candidate ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setMode(candidate)}
            >
              {candidate === 'full'
                ? t('settings.backupModeFull')
                : candidate === 'library'
                  ? t('settings.backupModeLibrary')
                  : t('settings.backupModeConfig')}
            </button>
          ))}
        </div>

        {/* The library archive carries SQLite snapshots only, so the warning
            belongs to the two modes that write the settings stores. */}
        {mode !== 'library' && (
          <div
            className="settings-privacy-notice"
            role="note"
            aria-label={t('settings.backupCredentialsNoticeTitle')}
          >
            <AlertTriangle size={16} className="settings-privacy-notice-icon" aria-hidden="true" />
            <div>
              <div className="settings-privacy-notice-title">
                {t('settings.backupCredentialsNoticeTitle')}
              </div>
              <div className="settings-privacy-notice-body">
                {t('settings.backupCredentialsNoticeBody')}
              </div>
            </div>
          </div>
        )}

        <SettingsSubCard>
          <SettingsField label={modeTitle} desc={modeDesc}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <button
                className="btn btn-primary"
                onClick={handleExport}
                disabled={exporting}
              >
                <Upload size={14} />
                {exporting ? '…' : exportLabel}
              </button>
              <button
                className="btn btn-surface"
                onClick={handleImport}
                disabled={importing}
              >
                <Download size={14} />
                {importing ? '…' : importLabel}
              </button>
            </div>
          </SettingsField>
        </SettingsSubCard>
      </SettingsGroup>
      {busyOverlay}
    </div>
  );
}
