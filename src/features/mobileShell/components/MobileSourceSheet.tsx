import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import type { ServerProfile } from '@/store/authStoreTypes';
import { switchActiveServer } from '@/utils/server/switchActiveServer';
import { showToast } from '@/lib/dom/toast';
import { serverListDisplayLabel } from '@/lib/server/serverDisplayName';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';
import {
  useMobileSourceScope,
  type MobileLibraryGroup,
} from '@/features/mobileShell/hooks/useMobileSourceScope';

interface Props {
  onClose: () => void;
}

/** Round check on the right of a row: its own tap target that adds or removes the row. */
function CheckToggle({ on, disabled, label, onToggle }: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="mobile-source-check"
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    >
      {on && <Check size={15} strokeWidth={3} aria-hidden="true" />}
    </button>
  );
}

/**
 * Touch shell: which servers and libraries the app browses — the desktop's
 * connection-menu server list and sidebar library picker in one sheet. Tapping
 * a name picks only that one (and closes); the round check adds or removes it.
 */
export default function MobileSourceSheet({ onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const scope = useMobileSourceScope();
  const setServerExclusive = useAuthStore(s => s.setLibraryBrowseServerExclusive);
  const setServerSelected = useAuthStore(s => s.setLibraryBrowseServerSelected);
  const setLibrarySelection = useAuthStore(s => s.setLibraryBrowseSelectionForServer);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const pickServer = async (server: ServerProfile) => {
    if (server.id === scope.activeServerId) {
      setServerExclusive(server.id);
      onClose();
      return;
    }
    setSwitchingId(server.id);
    const ok = await switchActiveServer(server).finally(() => setSwitchingId(null));
    if (!ok) {
      showToast(t('connection.switchFailed'), 5000, 'error');
      return;
    }
    setServerExclusive(server.id);
    onClose();
    navigate('/');
  };

  const pickOnlyLibrary = (serverId: string, libraryId: string) => {
    onClose();
    requestAnimationFrame(() => setLibrarySelection(serverId, [libraryId]));
  };

  const toggleLibrary = (group: MobileLibraryGroup, libraryId: string) => {
    const selected = group.selectedLibraryIds;
    if (selected.length === 0) setLibrarySelection(group.serverId, [libraryId]);
    else if (selected.includes(libraryId)) setLibrarySelection(group.serverId, selected.filter(id => id !== libraryId));
    else setLibrarySelection(group.serverId, [...selected, libraryId]);
  };

  const manageServers = () => {
    onClose();
    navigate('/settings', { state: { tab: 'servers' } });
  };

  return (
    <MobileSheet title={t('sidebar.libraryScope')} onClose={onClose} className="mobile-sheet--source">
      {scope.multiServer && (
        <section className="mobile-source-section">
          <h3 className="mobile-source-section__title">{t('settings.servers')}</h3>
          <div className="mobile-list-group">
            {scope.servers.map(server => {
              const included = scope.selectedServerIds.includes(server.id);
              const label = serverListDisplayLabel(server, scope.servers);
              const unavailable = scope.unavailableServerIds.has(server.id);
              const sub = unavailable
                ? t('connection.offlineSubtitle', { server: label })
                : server.id === scope.activeServerId ? t('settings.serverActive') : null;
              return (
                <div key={server.id} className="mobile-source-row">
                  <button
                    type="button"
                    className="mobile-source-row__main"
                    disabled={switchingId !== null}
                    onClick={() => void pickServer(server)}
                  >
                    <span className="mobile-source-row__label">{label}</span>
                    {sub && (
                      <span className={`mobile-source-row__sub${unavailable ? ' mobile-source-row__sub--warning' : ''}`}>
                        {sub}
                      </span>
                    )}
                  </button>
                  {switchingId === server.id ? (
                    <span className="spinner mobile-source-row__spinner" aria-hidden="true" />
                  ) : (
                    <CheckToggle
                      on={included}
                      disabled={included && scope.selectedServerIds.length === 1}
                      label={`${included ? t('sidebar.libraryDeselect', { name: label }) : t('sidebar.librarySelect', { name: label })} · ${t('sidebar.libraryScope')}`}
                      onToggle={() => setServerSelected(server.id, !included)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {scope.showLibraries && scope.libraryGroups.map(group => {
        const all = group.selectedLibraryIds.length === 0;
        return (
          <section key={group.serverId} className="mobile-source-section" aria-label={group.serverLabel}>
            <h3 className="mobile-source-section__title">
              {scope.libraryGroups.length > 1 ? `${t('sidebar.library')} · ${group.serverLabel}` : t('sidebar.library')}
            </h3>
            <div className="mobile-list-group">
              <div className="mobile-source-row">
                <button
                  type="button"
                  className="mobile-source-row__main"
                  aria-pressed={all}
                  onClick={() => setLibrarySelection(group.serverId, [])}
                >
                  <span className="mobile-source-row__label">{t('sidebar.allLibraries')}</span>
                </button>
                <span className="mobile-source-check" data-on={all || undefined} aria-hidden="true">
                  {all && <Check size={15} strokeWidth={3} />}
                </span>
              </div>
              {group.folders.map(folder => {
                const selected = group.selectedLibraryIds.includes(folder.id);
                const name = `${folder.name} · ${group.serverLabel}`;
                return (
                  <div key={folder.id} className="mobile-source-row">
                    <button
                      type="button"
                      className="mobile-source-row__main"
                      onClick={() => pickOnlyLibrary(group.serverId, folder.id)}
                    >
                      <span className="mobile-source-row__label">{folder.name}</span>
                    </button>
                    <CheckToggle
                      on={selected}
                      label={selected ? t('sidebar.libraryDeselect', { name }) : t('sidebar.librarySelect', { name })}
                      onToggle={() => toggleLibrary(group, folder.id)}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="mobile-list-group">
        <button type="button" className="mobile-list-row" onClick={manageServers}>
          <span className="mobile-list-row__label">{t('connection.manageServers')}</span>
          <ChevronRight className="mobile-list-row__chevron" size={18} aria-hidden="true" />
        </button>
      </div>
    </MobileSheet>
  );
}
