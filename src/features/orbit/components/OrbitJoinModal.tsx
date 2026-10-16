import { createPortal } from 'react-dom';
import { X, LogIn, ClipboardPaste } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOrbitJoinForm } from '@/features/orbit/hooks/useOrbitJoinForm';

interface Props {
  onClose: () => void;
}

/**
 * Orbit — manual join modal. Alternative to the Ctrl+V paste shortcut for
 * users who don't want to (or can't) paste the invite link into the app
 * directly. Reuses the same parse + preflight pipeline the clipboard
 * handler uses, so error surfaces stay consistent. The form state lives in
 * `useOrbitJoinForm` (shared with the touch shell's sheet).
 */
export default function OrbitJoinModal({ onClose }: Props) {
  const { t } = useTranslation();
  const { link, setLink, onPaste, busy, error, onJoin } = useOrbitJoinForm(onClose);

  return createPortal(
    <div
      className="modal-overlay orbit-start-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="orbit-join-title"
    >
      <div className="modal-content orbit-start-modal">
        <button type="button" className="modal-close" onClick={onClose} aria-label={t('orbit.closeAria')}>
          <X size={18} />
        </button>

        <div className="orbit-start-modal__hero">
          <div className="orbit-start-modal__hero-icon">
            <LogIn size={24} />
          </div>
          <h3 id="orbit-join-title" className="orbit-start-modal__title">
            {t('orbit.joinModalTitle')}
          </h3>
          <p className="orbit-start-modal__sub">{t('orbit.joinModalSub')}</p>
        </div>

        <div className="orbit-start-modal__field">
          <label className="orbit-start-modal__label" htmlFor="orbit-join-link">
            {t('orbit.joinModalLinkLabel')}
          </label>
          <div className="orbit-start-modal__input-row">
            <input
              id="orbit-join-link"
              type="text"
              autoFocus
              value={link}
              onChange={e => setLink(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !busy) void onJoin(); }}
              placeholder={t('orbit.joinModalLinkPlaceholder')}
              className="orbit-start-modal__input"
            />
            <button
              type="button"
              className="orbit-start-modal__reshuffle"
              onClick={onPaste}
              data-tooltip={t('orbit.joinModalPasteTooltip')}
              aria-label={t('orbit.joinModalPasteTooltip')}
            >
              <ClipboardPaste size={15} />
            </button>
          </div>
          <div className="orbit-start-modal__helper">{t('orbit.joinModalLinkHelper')}</div>
        </div>

        {error && <div className="orbit-start-modal__error">{error}</div>}

        <div className="orbit-start-modal__actions">
          <button type="button" className="btn btn-surface" onClick={onClose}>
            {t('orbit.btnCancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { void onJoin(); }}
            disabled={busy || !link.trim()}
          >
            {busy ? t('orbit.joinModalBusy') : t('orbit.joinModalSubmit')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
