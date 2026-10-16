import { useTranslation } from 'react-i18next';
import { ClipboardPaste, Loader2 } from 'lucide-react';
import { useOrbitJoinForm } from '@/features/orbit';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';

/**
 * Touch layout of the Orbit join dialog: a sheet with the invite-link field, a
 * paste button beside it and a full-width join button. No autofocus, so the
 * keyboard stays down (the paste button is usually all it takes). A failed
 * join reads as its translated reason, not the developer message.
 */
export default function MobileOrbitJoinSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const form = useOrbitJoinForm(onClose, { translateErrors: true });

  return (
    <MobileSheet title={t('orbit.launchJoin')} onClose={onClose} className="mobile-sheet--orbit-form">
      <p className="mobile-orbit-form__intro">{t('orbit.joinModalSub')}</p>

      <section className="mobile-orbit-form__field">
        <label className="mobile-orbit-form__label" htmlFor="mobile-orbit-join-link">{t('orbit.joinModalLinkLabel')}</label>
        <div className="mobile-form-group mobile-orbit-form__input-row">
          <input
            id="mobile-orbit-join-link"
            className="mobile-form-group__input"
            value={form.link}
            onChange={e => form.setLink(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !form.busy) void form.onJoin(); }}
            placeholder={t('orbit.joinModalLinkPlaceholder')}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
          />
          <button
            type="button"
            className="mobile-orbit-form__field-btn"
            onClick={() => { void form.onPaste(); }}
            aria-label={t('orbit.joinModalPasteTooltip')}
          >
            <ClipboardPaste size={20} aria-hidden="true" />
          </button>
        </div>
        <p className="mobile-orbit-form__helper">{t('orbit.joinModalLinkHelper')}</p>
      </section>

      {form.error && <p className="mobile-orbit-form__error" role="alert">{form.error}</p>}

      <button
        type="button"
        className="btn btn-primary mobile-orbit-form__submit"
        onClick={() => { void form.onJoin(); }}
        disabled={form.busy || !form.link.trim()}
      >
        {form.busy && <Loader2 size={17} className="spin-slow" aria-hidden="true" />}
        {form.busy ? t('orbit.joinModalBusy') : t('orbit.joinModalSubmit')}
      </button>
    </MobileSheet>
  );
}
