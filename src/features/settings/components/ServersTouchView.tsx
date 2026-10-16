import type React from 'react';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import {
  AlertTriangle, Check, CheckCircle2, ChevronRight, Lock, LogOut, Pencil, Plus, Power, RefreshCw,
  Server, ShieldCheck, Wifi, WifiOff, X, Zap,
} from 'lucide-react';
import { MobileSheet } from '@/features/mobileShell';
import { useAuthStore } from '@/store/authStore';
import type { ServerProfile } from '@/store/authStoreTypes';
import type { ServerMagicPayload } from '@/lib/server/serverMagicString';
import { formatServerSoftware } from '@/lib/server/subsonicServerIdentity';
import { serverIdentityLabel, serverSettingsEntryTitle } from '@/lib/server/serverDisplayName';
import { serverIndexKeyForProfile } from '@/lib/server/serverIndexKey';
import { FEATURE_AUDIOMUSE_SIMILAR_TRACKS } from '@/lib/serverCapabilities/catalog';
import { isFeatureActiveForServer, resolveFeatureForServer } from '@/lib/serverCapabilities/storeView';
import type { useLibraryIndexSync } from '@/lib/library/hooks/useLibraryIndexSync';
import { AddServerForm } from '@/features/settings/components/AddServerForm';
import { ServerCapabilityHeaderBadge } from '@/features/settings/components/ServerCapabilityHeaderBadge';
import { libraryIndexPhaseLabel } from '@/features/settings/utils/libraryIndexPhaseLabel';
import { AUDIOMUSE_NV_PLUGIN_URL, showLegacyAudiomuseToggleRow } from '@/features/settings/utils/serverAudiomuseRows';

type ConnState = 'idle' | 'testing' | 'ok' | 'error';
type ServerData = Omit<ServerProfile, 'id'>;
type LibrarySync = ReturnType<typeof useLibraryIndexSync>;

interface Props {
  servers: ServerProfile[];
  activeServerId: string | null;
  connStatus: Record<string, ConnState>;
  librarySync: LibrarySync;
  /** Rows' container for the shared reorder hook (hold a row, drag it). */
  setReorderContainer: (el: HTMLElement | null) => void;
  dropEdge: (id: string) => 'before' | 'after' | null;
  addFormOpen: boolean;
  addFormInvite: ServerMagicPayload | null;
  onOpenAddForm: () => void;
  onCloseAddForm: () => void;
  onAddServer: (data: ServerData) => Promise<void>;
  editingServerId: string | null;
  onStartEdit: (id: string) => void;
  onCancelEdit: () => void;
  onEditServer: (id: string, data: ServerData, onPersisted?: () => void) => Promise<void>;
  onDeleteServer: (server: ServerProfile) => Promise<void>;
  onTestConnection: (server: ServerProfile) => void;
  onUseServer: (server: ServerProfile) => void;
  onLogout: () => void;
}

function ConnStateIcon({ state }: { state: ConnState | undefined }) {
  if (state === 'ok') return <CheckCircle2 size={18} className="server-touch__ok" aria-hidden="true" />;
  if (state === 'error') return <WifiOff size={18} className="server-touch__error" aria-hidden="true" />;
  if (state === 'testing') return <span className="spinner server-touch__spinner" aria-hidden="true" />;
  return null;
}

/** Index status and the full / delta / verify actions of one server, as an iOS group. */
function ServerIndexTouch({ server, librarySync }: { server: ServerProfile; librarySync: LibrarySync }) {
  const { t } = useTranslation();
  const key = serverIndexKeyForProfile(server);
  const connection = librarySync.connectionByServer[key] ?? 'unknown';
  const busy = librarySync.busyServerId === key;
  const disabled = busy
    || (librarySync.globalBusy && librarySync.busyServerId !== key)
    || connection === 'offline';
  const phase = libraryIndexPhaseLabel(
    t,
    librarySync.statusByServer[key] ?? null,
    connection,
    librarySync.progressByServer[key] ?? null,
  );
  const actions: { id: 'full' | 'delta' | 'verify'; icon: React.ReactNode; label: string }[] = [
    { id: 'full', icon: <RefreshCw />, label: t('settings.libraryIndexFullResync') },
    { id: 'delta', icon: <Zap />, label: t('settings.libraryIndexDeltaSync') },
    { id: 'verify', icon: <ShieldCheck />, label: t('settings.libraryIndexVerify') },
  ];

  return (
    <section className="server-touch-section">
      <h3 className="server-touch-section__title">{t('settings.libraryIndexTitle')}</h3>
      <p className={`server-touch-index__status${busy ? ' server-touch-index__status--busy' : ''}`}>
        {connection === 'offline' && <WifiOff size={14} aria-hidden="true" />}
        {busy ? `${t('settings.libraryIndexServerSyncing')} ${phase}` : phase}
      </p>
      <div className="settings-touch-group">
        {actions.map(action => (
          <button
            key={action.id}
            type="button"
            className="settings-touch-row"
            disabled={disabled}
            onClick={() => void librarySync.runServerAction(key, action.id)}
          >
            <span className="settings-touch-row__icon" aria-hidden="true">{action.icon}</span>
            <span className="settings-touch-row__label">{action.label}</span>
          </button>
        ))}
        {busy && (
          <button
            type="button"
            className="settings-touch-row"
            onClick={() => void librarySync.handleCancel(key)}
          >
            <span className="settings-touch-row__icon server-touch__icon--danger" aria-hidden="true"><X /></span>
            <span className="settings-touch-row__label">{t('settings.libraryIndexCancel')}</span>
          </button>
        )}
      </div>
    </section>
  );
}

interface SheetProps {
  server: ServerProfile;
  isActive: boolean;
  connState: ConnState | undefined;
  librarySync: LibrarySync;
  onClose: () => void;
  onEdit: () => void;
  onTest: () => void;
  onUse: () => void;
}

/** Everything about one server: use it, test it, its index, AudioMuse, edit. */
function ServerTouchSheet({ server, isActive, connState, librarySync, onClose, onEdit, onTest, onUse }: SheetProps) {
  const { t } = useTranslation();
  const auth = useAuthStore();
  const identity = auth.subsonicServerIdentityByServer[server.id];
  const software = formatServerSoftware(identity);
  const resolvedAudiomuse = resolveFeatureForServer(server.id, FEATURE_AUDIOMUSE_SIMILAR_TRACKS);
  const audiomuseActive = isFeatureActiveForServer(server.id, FEATURE_AUDIOMUSE_SIMILAR_TRACKS);
  const audiomuseIssue = !!auth.audiomuseNavidromeIssueByServer[server.id];
  const autoAudiomuseIssue = resolvedAudiomuse?.activation === 'auto' && audiomuseActive && audiomuseIssue;
  const legacyAudiomuse = showLegacyAudiomuseToggleRow(identity, auth.instantMixProbeByServer[server.id], resolvedAudiomuse);
  const legacyAudiomuseOn = !!auth.audiomuseNavidromeByServer[server.id];
  const testing = connState === 'testing';

  return (
    <MobileSheet title={serverSettingsEntryTitle(server)} onClose={onClose} className="mobile-sheet--server">
      <div className="server-touch-head">
        <ServerCapabilityHeaderBadge serverId={server.id} feature={FEATURE_AUDIOMUSE_SIMILAR_TRACKS} />
        <span className="server-touch-head__line">
          {server.url.startsWith('https://') && <Lock size={12} className="server-touch__ok" aria-hidden="true" />}
          <span className="server-touch-head__text">{serverIdentityLabel(server)}</span>
        </span>
        <span className="server-touch-head__line server-touch-head__line--muted">
          {software ?? t('settings.serverVersionUnknown')}
        </span>
        {autoAudiomuseIssue && (
          <span className="server-touch-head__line server-touch__warning">
            <AlertTriangle size={14} aria-hidden="true" />
            {t('settings.audiomuseIssueHint')}
          </span>
        )}
      </div>

      <div className="settings-touch-group">
        {isActive ? (
          <div className="settings-touch-row">
            <span className="settings-touch-row__icon server-touch__icon--positive" aria-hidden="true"><Check /></span>
            <span className="settings-touch-row__label">{t('settings.serverActive')}</span>
          </div>
        ) : (
          <button type="button" className="settings-touch-row" disabled={testing} onClick={onUse}>
            <span className="settings-touch-row__icon" aria-hidden="true"><Power /></span>
            <span className="settings-touch-row__label">{t('settings.useServer')}</span>
          </button>
        )}
        <button type="button" className="settings-touch-row" disabled={testing} onClick={onTest}>
          <span className="settings-touch-row__icon" aria-hidden="true"><Wifi /></span>
          <span className="settings-touch-row__label">{t('settings.testBtn')}</span>
          <ConnStateIcon state={connState} />
        </button>
        <button type="button" className="settings-touch-row" onClick={onEdit}>
          <span className="settings-touch-row__icon" aria-hidden="true"><Pencil /></span>
          <span className="settings-touch-row__label">{t('settings.editServerTitle')}</span>
          <ChevronRight size={18} className="settings-touch-row__chevron" aria-hidden="true" />
        </button>
      </div>

      <ServerIndexTouch server={server} librarySync={librarySync} />

      {legacyAudiomuse && (
        <section className="server-touch-section">
          <div className="settings-touch-group">
            <label className="settings-touch-row settings-touch-row--toggle">
              <span className="settings-touch-row__label">{t('settings.audiomuseTitle')}</span>
              {legacyAudiomuseOn && audiomuseIssue && (
                <AlertTriangle size={16} className="server-touch__warning" aria-label={t('settings.audiomuseIssueHint')} />
              )}
              <span className="toggle-switch">
                <input
                  type="checkbox"
                  checked={legacyAudiomuseOn}
                  onChange={e => auth.setAudiomuseNavidromeEnabled(server.id, e.target.checked)}
                />
                <span className="toggle-track" />
              </span>
            </label>
          </div>
          <p className="settings-touch-footnote server-touch-section__note">
            <Trans
              i18nKey="settings.audiomuseDesc"
              components={{
                pluginLink: (
                  <a
                    href={AUDIOMUSE_NV_PLUGIN_URL}
                    onClick={e => {
                      e.preventDefault();
                      void openUrl(AUDIOMUSE_NV_PLUGIN_URL);
                    }}
                  />
                ),
              }}
            />
          </p>
        </section>
      )}
    </MobileSheet>
  );
}

/**
 * Settings → Servers in the touch shell: one row per server (hold and drag to
 * reorder), tapping a row opens its sheet; adding and editing use the desktop
 * form inside a sheet. All actions are the desktop tab's, handed in as props.
 */
export function ServersTouchView(props: Props) {
  const {
    servers, activeServerId, connStatus, librarySync, setReorderContainer, dropEdge,
    addFormOpen, addFormInvite, onOpenAddForm, onCloseAddForm, onAddServer,
    editingServerId, onStartEdit, onCancelEdit, onEditServer, onDeleteServer,
    onTestConnection, onUseServer, onLogout,
  } = props;
  const { t } = useTranslation();
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = servers.find(server => server.id === detailId) ?? null;
  const editing = servers.find(server => server.id === editingServerId) ?? null;

  const onRowKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    setDetailId(id);
  };

  return (
    <div className="server-touch">
      {servers.length === 0 ? (
        <p className="settings-touch-footnote server-touch__empty">{t('settings.noServers')}</p>
      ) : (
        <div className="settings-touch-group server-touch-list" ref={setReorderContainer}>
          {servers.map(server => {
            const edge = dropEdge(server.id);
            return (
              <div
                key={server.id}
                data-reorder-id={server.id}
                role="button"
                tabIndex={0}
                className={`settings-touch-row server-touch-row${edge ? ` drop-${edge}` : ''}`}
                onClick={() => setDetailId(server.id)}
                onKeyDown={e => onRowKey(e, server.id)}
              >
                <span className="settings-touch-row__icon" aria-hidden="true"><Server /></span>
                <span className="server-touch-row__text">
                  <span className="server-touch-row__name">{serverSettingsEntryTitle(server)}</span>
                  <span className="server-touch-row__sub">{serverIdentityLabel(server)}</span>
                </span>
                <ConnStateIcon state={connStatus[server.id]} />
                {server.id === activeServerId && (
                  <span className="server-touch-row__active">{t('settings.serverActive')}</span>
                )}
                <ChevronRight size={18} className="settings-touch-row__chevron" aria-hidden="true" />
              </div>
            );
          })}
        </div>
      )}
      <p className="settings-touch-footnote server-touch__note">{t('settings.serverCompatible')}</p>

      <div className="settings-touch-group">
        <button type="button" className="settings-touch-row" onClick={onOpenAddForm}>
          <span className="settings-touch-row__icon" aria-hidden="true"><Plus /></span>
          <span className="settings-touch-row__label">{t('settings.addServer')}</span>
        </button>
      </div>

      <div className="settings-touch-group">
        <button type="button" className="settings-touch-row server-touch-logout" onClick={onLogout}>
          <span className="settings-touch-row__icon server-touch__icon--danger" aria-hidden="true"><LogOut /></span>
          <span className="settings-touch-row__label">{t('settings.logout')}</span>
        </button>
      </div>

      {detail && (
        <ServerTouchSheet
          server={detail}
          isActive={detail.id === activeServerId}
          connState={connStatus[detail.id]}
          librarySync={librarySync}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setDetailId(null);
            onStartEdit(detail.id);
          }}
          onTest={() => onTestConnection(detail)}
          onUse={() => onUseServer(detail)}
        />
      )}

      {editing && (
        <MobileSheet title={t('settings.editServerTitle')} onClose={onCancelEdit} className="mobile-sheet--server-form">
          <AddServerForm
            editingServer={editing}
            onSave={(data, onPersisted) => onEditServer(editing.id, data, onPersisted)}
            onCancel={onCancelEdit}
            onDelete={() => onDeleteServer(editing)}
          />
        </MobileSheet>
      )}

      {addFormOpen && (
        <MobileSheet title={t('settings.addServerTitle')} onClose={onCloseAddForm} className="mobile-sheet--server-form">
          <AddServerForm initialInvite={addFormInvite} onSave={onAddServer} onCancel={onCloseAddForm} />
        </MobileSheet>
      )}
    </div>
  );
}
