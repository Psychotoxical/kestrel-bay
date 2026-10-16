import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  X, Check, Copy, Orbit as OrbitIcon,
  Dices, AlertTriangle, Globe2,
} from 'lucide-react';
import ServerChoiceList from '@/ui/ServerChoiceList';
import { useOrbitStartForm } from '@/features/orbit/hooks/useOrbitStartForm';

interface Props { onClose: () => void; }

/**
 * Orbit — start-session modal.
 *
 * One-screen flow: a share-link is shown immediately (built from a
 * pre-generated session id + a slug derived from the live name). The host
 * can copy it any time; pressing "Start" creates the session under that
 * same id and auto-copies the link if it hasn't been copied yet. The form
 * state lives in `useOrbitStartForm` (shared with the touch shell's sheet).
 */
export default function OrbitStartModal({ onClose }: Props) {
  const { t } = useTranslation();
  const {
    name, setName, reshuffleName, maxUsers, setMaxUsers, clearQueue, setClearQueue,
    serverId, serverOptions, selectServer, server, serverName, onLan,
    shareLink, copied, hasCopied, onCopy, busy, error, onStart,
  } = useOrbitStartForm(onClose);

  const heroSubParts = t('orbit.heroSub', { server: serverName }).split(String(serverName));

  return createPortal(
    <div
      className="modal-overlay orbit-start-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="orbit-start-title"
    >
      <div className="modal-content orbit-start-modal">
        <button type="button" className="modal-close" onClick={onClose} aria-label={t('orbit.closeAria')}>
          <X size={18} />
        </button>

        <div className="orbit-start-modal__hero">
          <div className="orbit-start-modal__hero-icon">
            <OrbitIcon size={24} />
          </div>
          <h3 id="orbit-start-title" className="orbit-start-modal__title">
            {t('orbit.heroTitlePrefix')}{' '}
            <span className="orbit-start-modal__brand">{t('orbit.heroTitleBrand')}</span>
          </h3>
          <p className="orbit-start-modal__sub">
            {heroSubParts[0]}
            <strong>{serverName}</strong>
            {heroSubParts[1] ?? ''}
          </p>
        </div>

        <div
          className={`orbit-start-modal__tip${onLan ? ' orbit-start-modal__tip--warn' : ''}`}
          role={onLan ? 'alert' : undefined}
        >
          {onLan ? <AlertTriangle size={15} /> : <Globe2 size={15} />}
          <span>{onLan ? t('orbit.tipLan') : t('orbit.tipRemote')}</span>
        </div>

        {serverOptions.length > 1 && (
          <div className="orbit-start-modal__field">
            <div className="orbit-start-modal__label">{t('orbit.labelServer')}</div>
            <ServerChoiceList
              value={serverId}
              options={serverOptions}
              onChange={selectServer}
              ariaLabel={t('orbit.serverAria')}
              disabled={busy}
            />
            <div className="orbit-start-modal__helper">{t('orbit.helperServer')}</div>
          </div>
        )}

        <div className="orbit-start-modal__field">
          <label className="orbit-start-modal__label" htmlFor="orbit-name">
            {t('orbit.labelName')}
          </label>
          <div className="orbit-start-modal__input-row">
            <input
              id="orbit-name"
              type="text"
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                if (busy || !name.trim() || !server) return;
                e.preventDefault();
                void onStart();
              }}
              placeholder={t('orbit.namePlaceholder')}
              maxLength={40}
              className="orbit-start-modal__input"
            />
            <button
              type="button"
              className="orbit-start-modal__reshuffle"
              onClick={reshuffleName}
              data-tooltip={t('orbit.reshuffleTooltip')}
              aria-label={t('orbit.reshuffleAria')}
            >
              <Dices size={15} />
            </button>
          </div>
          <div className="orbit-start-modal__helper">{t('orbit.helperName')}</div>
        </div>

        <div className="orbit-start-modal__field">
          <label className="orbit-start-modal__label" htmlFor="orbit-max">
            {t('orbit.labelMax')}: <strong>{maxUsers}</strong>
          </label>
          <input
            id="orbit-max"
            type="range"
            min={1}
            max={32}
            value={maxUsers}
            onChange={e => setMaxUsers(Number(e.target.value))}
            className="orbit-start-modal__range"
          />
          <div className="orbit-start-modal__helper">{t('orbit.helperMax')}</div>
        </div>

        <div className="orbit-start-modal__field">
          <label className="orbit-start-modal__toggle-row">
            <div className="orbit-start-modal__toggle-text">
              <div className="orbit-start-modal__label">{t('orbit.labelClearQueue')}</div>
              <div className="orbit-start-modal__helper">{t('orbit.helperClearQueue')}</div>
            </div>
            <span className="toggle-switch">
              <input
                type="checkbox"
                checked={clearQueue}
                onChange={e => setClearQueue(e.target.checked)}
              />
              <span className="toggle-track" />
            </span>
          </label>
        </div>

        <div className="orbit-start-modal__field">
          <label className="orbit-start-modal__label">{t('orbit.labelLink')}</label>
          <div className="orbit-start-modal__link">
            <code>{shareLink}</code>
            <button
              type="button"
              className="orbit-start-modal__copy"
              onClick={onCopy}
              data-tooltip={copied ? t('orbit.tooltipCopied') : t('orbit.tooltipCopy')}
              aria-label={t('orbit.ariaCopyLink')}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <div className="orbit-start-modal__helper">{t('orbit.helperLink')}</div>
        </div>

        {error && <div className="orbit-start-modal__error">{error}</div>}

        <div className="orbit-start-modal__actions">
          <button type="button" className="btn btn-surface" onClick={onClose}>
            {t('orbit.btnCancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { void onStart(); }}
            disabled={busy || !name.trim() || !server}
          >
            {busy
              ? t('orbit.btnStarting')
              : hasCopied ? t('orbit.btnStart') : t('orbit.btnCopyAndStart')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
