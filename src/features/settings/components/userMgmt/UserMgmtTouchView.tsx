import type React from 'react';
import { useState } from 'react';
import { ChevronRight, Pencil, Trash2, UserPlus, Wand2 } from 'lucide-react';
import type { i18n as I18nType, TFunction } from 'i18next';
import { MobileSheet } from '@/features/mobileShell';
import { useMobileActionSheetStore } from '@/features/mobileShell/store/mobileActionSheetStore';
import type { NdLibrary, NdUser } from '@/lib/api/navidromeAdmin';
import { formatLastSeen } from '@/lib/format/userMgmtHelpers';

/**
 * Touch shell: the admin's user list in the style of Settings → Servers — one
 * row per user (initial, name, role and last activity) that opens a sheet with
 * the user's libraries and actions. Forms and the magic-string dialog stay
 * the shared ones; the parent renders them.
 */
export function UserMgmtTouchView({
  users,
  libraries,
  currentUsername,
  busy,
  onAdd,
  onEdit,
  onDelete,
  onRequestMagic,
  t,
  i18n,
}: {
  users: NdUser[];
  libraries: NdLibrary[];
  currentUsername: string;
  busy: boolean;
  onAdd: () => void;
  onEdit: (u: NdUser) => void;
  onDelete: (u: NdUser) => void;
  onRequestMagic: (u: NdUser) => void;
  t: TFunction;
  i18n: I18nType;
}) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = users.find(u => u.id === detailId) ?? null;

  const subLine = (u: NdUser) => {
    const lastSeen = formatLastSeen(u.lastAccessAt, i18n.language, t('settings.userMgmtNeverSeen'));
    const role = u.isAdmin ? t('settings.userMgmtAdminBadge') : t('settings.userMgmtTouchUser');
    return `${role} · ${t('settings.userMgmtTouchLastSeen', { when: lastSeen })}`;
  };
  const onRowKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    setDetailId(id);
  };
  const askDelete = async (u: NdUser) => {
    const choice = await useMobileActionSheetStore.getState().request({
      title: t('settings.userMgmtDelete'),
      message: t('settings.userMgmtConfirmDelete', { username: u.userName }),
      actions: [
        { id: 'delete', label: t('settings.userMgmtDelete'), danger: true },
        { id: 'cancel', label: t('settings.userMgmtCancel') },
      ],
    });
    if (choice === 'delete') onDelete(u);
  };

  return (
    <div className="server-touch">
      <div className="settings-touch-group">
        <button type="button" className="settings-touch-row" disabled={busy} onClick={onAdd}>
          <span className="settings-touch-row__icon" aria-hidden="true"><UserPlus /></span>
          <span className="settings-touch-row__label">{t('settings.userMgmtAddUser')}</span>
        </button>
      </div>
      {users.length === 0 ? (
        <p className="settings-touch-footnote server-touch__empty">{t('settings.userMgmtEmpty')}</p>
      ) : (
        <div className="settings-touch-group">
          {users.map(u => (
            <div
              key={u.id}
              role="button"
              tabIndex={0}
              className="settings-touch-row server-touch-row"
              onClick={() => setDetailId(u.id)}
              onKeyDown={e => onRowKey(e, u.id)}
            >
              <span className="user-touch-avatar" aria-hidden="true">
                {(u.name || u.userName).trim().charAt(0).toUpperCase() || '?'}
              </span>
              <span className="server-touch-row__text">
                <span className="server-touch-row__name">
                  {u.name || u.userName}
                  {u.userName === currentUsername && (
                    <span className="user-touch-badge">{t('settings.userMgmtYouBadge')}</span>
                  )}
                </span>
                <span className="server-touch-row__sub">{subLine(u)}</span>
              </span>
              <ChevronRight size={18} className="settings-touch-row__chevron" aria-hidden="true" />
            </div>
          ))}
        </div>
      )}
      <p className="settings-touch-footnote server-touch__note">{t('settings.userMgmtDesc')}</p>
      {detail && (
        <MobileSheet title={detail.name || detail.userName} onClose={() => setDetailId(null)} className="mobile-sheet--server">
          <div className="server-touch-head">
            {detail.name && detail.name !== detail.userName && (
              <span className="server-touch-head__line">{detail.userName}</span>
            )}
            <span className="server-touch-head__line server-touch-head__line--muted">{subLine(detail)}</span>
          </div>
          <section className="server-touch-section">
            <h3 className="server-touch-section__title">{t('settings.userMgmtLibraries')}</h3>
            {detail.isAdmin ? (
              <p className="settings-touch-footnote">{t('settings.userMgmtLibrariesAdminHint')}</p>
            ) : detail.libraryIds.length === 0 ? (
              <p className="settings-touch-footnote">{t('settings.userMgmtNoLibraries')}</p>
            ) : (
              <div className="user-touch-chips">
                {libraries.filter(l => detail.libraryIds.includes(l.id)).map(l => (
                  <span key={l.id} className="user-touch-chip">{l.name}</span>
                ))}
              </div>
            )}
          </section>
          <div className="settings-touch-group">
            {!detail.isAdmin && (
              <button
                type="button"
                className="settings-touch-row"
                disabled={busy}
                onClick={() => { setDetailId(null); onRequestMagic(detail); }}
              >
                <span className="settings-touch-row__icon" aria-hidden="true"><Wand2 /></span>
                <span className="settings-touch-row__label">{t('settings.userMgmtMagicStringGenerate')}</span>
              </button>
            )}
            <button
              type="button"
              className="settings-touch-row"
              disabled={busy}
              onClick={() => { setDetailId(null); onEdit(detail); }}
            >
              <span className="settings-touch-row__icon" aria-hidden="true"><Pencil /></span>
              <span className="settings-touch-row__label">{t('settings.userMgmtEdit')}</span>
              <ChevronRight size={18} className="settings-touch-row__chevron" aria-hidden="true" />
            </button>
          </div>
          {detail.userName !== currentUsername && (
            <div className="settings-touch-group">
              <button
                type="button"
                className="settings-touch-row server-touch-logout"
                disabled={busy}
                onClick={() => { setDetailId(null); void askDelete(detail); }}
              >
                <span className="settings-touch-row__icon server-touch__icon--danger" aria-hidden="true"><Trash2 /></span>
                <span className="settings-touch-row__label">{t('settings.userMgmtTouchDelete')}</span>
              </button>
            </div>
          )}
        </MobileSheet>
      )}
    </div>
  );
}
