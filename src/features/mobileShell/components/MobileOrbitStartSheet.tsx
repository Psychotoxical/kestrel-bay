import { useTranslation } from 'react-i18next';
import { AlertTriangle, Dices, Globe2, Loader2 } from 'lucide-react';
import { useOrbitStartForm } from '@/features/orbit';
import ServerChoiceList from '@/ui/ServerChoiceList';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';

/**
 * Touch layout of the Orbit start dialog: a sheet with the session name, the
 * guest limit and the queue choice, and a full-width start button. No autofocus,
 * so the keyboard stays down until the name is tapped. No invite-link field:
 * once the session runs, the room's "Share invite link" sends the invite (the
 * desktop dialog's "paste it with Ctrl+V" has no place on the phone).
 */
export default function MobileOrbitStartSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const form = useOrbitStartForm(onClose);
  const subParts = t('orbit.heroSub', { server: form.serverName }).split(String(form.serverName));

  return (
    <MobileSheet title={t('orbit.launchCreate')} onClose={onClose} className="mobile-sheet--orbit-form">
      <p className="mobile-orbit-form__intro">
        {subParts[0]}
        <strong>{form.serverName}</strong>
        {subParts[1] ?? ''}
      </p>

      <div className={`mobile-orbit-form__tip${form.onLan ? ' is-warn' : ''}`} role={form.onLan ? 'alert' : undefined}>
        {form.onLan ? <AlertTriangle size={17} aria-hidden="true" /> : <Globe2 size={17} aria-hidden="true" />}
        <span>{form.onLan ? t('orbit.tipLan') : t('orbit.tipRemote')}</span>
      </div>

      {form.serverOptions.length > 1 && (
        <section className="mobile-orbit-form__field">
          <h3 className="mobile-orbit-form__label">{t('orbit.labelServer')}</h3>
          <ServerChoiceList
            value={form.serverId}
            options={form.serverOptions}
            onChange={form.selectServer}
            ariaLabel={t('orbit.serverAria')}
            disabled={form.busy}
          />
        </section>
      )}

      <section className="mobile-orbit-form__field">
        <label className="mobile-orbit-form__label" htmlFor="mobile-orbit-name">{t('orbit.labelName')}</label>
        <div className="mobile-form-group mobile-orbit-form__input-row">
          <input
            id="mobile-orbit-name"
            className="mobile-form-group__input"
            value={form.name}
            onChange={e => form.setName(e.target.value)}
            placeholder={t('orbit.namePlaceholder')}
            maxLength={40}
            enterKeyHint="done"
          />
          <button
            type="button"
            className="mobile-orbit-form__field-btn"
            onClick={form.reshuffleName}
            aria-label={t('orbit.reshuffleAria')}
          >
            <Dices size={20} aria-hidden="true" />
          </button>
        </div>
        <p className="mobile-orbit-form__helper">{t('orbit.helperName')}</p>
      </section>

      <section className="mobile-orbit-form__field">
        <label className="mobile-orbit-form__label" htmlFor="mobile-orbit-max">
          {t('orbit.labelMax')}: <strong>{form.maxUsers}</strong>
        </label>
        <input
          id="mobile-orbit-max"
          type="range"
          min={1}
          max={32}
          value={form.maxUsers}
          onChange={e => form.setMaxUsers(Number(e.target.value))}
          className="mobile-orbit-form__range"
        />
        <p className="mobile-orbit-form__helper">{t('orbit.helperMax')}</p>
      </section>

      <section className="mobile-orbit-form__field">
        <div className="mobile-form-group">
          <label className="mobile-form-group__row">
            <span>{t('orbit.labelClearQueue')}</span>
            <span className="toggle-switch">
              <input type="checkbox" checked={form.clearQueue} onChange={e => form.setClearQueue(e.target.checked)} />
              <span className="toggle-track" />
            </span>
          </label>
        </div>
        <p className="mobile-orbit-form__helper">{t('orbit.helperClearQueue')}</p>
      </section>

      {form.error && <p className="mobile-orbit-form__error" role="alert">{form.error}</p>}

      <button
        type="button"
        className="btn btn-primary mobile-orbit-form__submit"
        onClick={() => { void form.onStart({ copyLink: false }); }}
        disabled={form.busy || !form.name.trim() || !form.server}
      >
        {form.busy && <Loader2 size={17} className="spin-slow" aria-hidden="true" />}
        {form.busy ? t('orbit.btnStarting') : t('orbit.btnStart')}
      </button>
    </MobileSheet>
  );
}
