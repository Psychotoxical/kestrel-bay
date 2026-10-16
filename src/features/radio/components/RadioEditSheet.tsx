import { useTranslation } from 'react-i18next';
import { Camera, Loader2 } from 'lucide-react';
import ServerSelect from '@/ui/ServerSelect';
import { MobileSheet } from '@/features/mobileShell';
import { useRadioEditForm, type RadioEditProps } from '@/features/radio/hooks/useRadioEditForm';
import RadioEditCover from '@/features/radio/components/RadioEditCover';

/**
 * Touch layout of the station dialog, same build as the playlist edit sheet:
 * logo on top, the fields as one grouped list (URL keyboards, no autocorrect)
 * and a full-width save button. No autofocus, so the keyboard stays down.
 */
export default function RadioEditSheet(props: RadioEditProps) {
  const { station, serverOptions, onClose } = props;
  const { t } = useTranslation();
  const {
    name, setName, streamUrl, setStreamUrl, homepageUrl, setHomepageUrl,
    serverId, setRequestedServerId, coverPreview, coverRemoved, hasExistingCover, saving, canSave,
    coverInputRef, pickCover, handleFileChange, handleRemoveCover, handleSave,
  } = useRadioEditForm(props);

  return (
    <MobileSheet
      title={station ? t('radio.editStation') : t('radio.addStation')}
      onClose={onClose}
      className="mobile-sheet--playlist-edit"
    >
      <div className="mobile-playlist-edit__cover-block">
        <button
          type="button"
          className="mobile-playlist-edit__cover"
          onClick={pickCover}
          aria-label={t('radio.changeCoverLabel')}
        >
          <RadioEditCover station={station} coverPreview={coverPreview} coverRemoved={coverRemoved} size={168} />
          <span className="mobile-playlist-edit__cover-badge" aria-hidden="true">
            <Camera size={18} />
          </span>
        </button>
        <div className="mobile-playlist-edit__cover-actions">
          <button type="button" className="mobile-playlist-edit__link" onClick={pickCover}>
            {t('radio.changeCoverLabel')}
          </button>
          {hasExistingCover && (
            <button
              type="button"
              className="mobile-playlist-edit__link mobile-playlist-edit__link--danger"
              onClick={handleRemoveCover}
            >
              {t('radio.removeCover')}
            </button>
          )}
        </div>
        <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
      </div>

      {!station && (
        <ServerSelect
          value={serverId}
          options={serverOptions}
          onChange={setRequestedServerId}
          disabled={saving}
          style={{ width: '100%' }}
        />
      )}

      <div className="mobile-form-group">
        <input
          className="mobile-form-group__input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('radio.stationName')}
          aria-label={t('radio.stationName')}
          enterKeyHint="next"
        />
        <input
          className="mobile-form-group__input"
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={streamUrl}
          onChange={e => setStreamUrl(e.target.value)}
          placeholder={t('radio.streamUrl')}
          aria-label={t('radio.streamUrl')}
          enterKeyHint="next"
        />
        <input
          className="mobile-form-group__input"
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={homepageUrl}
          onChange={e => setHomepageUrl(e.target.value)}
          placeholder={t('radio.homepageUrl')}
          aria-label={t('radio.homepageUrl')}
          enterKeyHint="done"
        />
      </div>

      <button
        type="button"
        className="btn btn-primary mobile-playlist-edit__save"
        onClick={handleSave}
        disabled={!canSave}
      >
        {saving ? <Loader2 size={16} className="spin-slow" /> : null}
        {t('radio.save')}
      </button>
    </MobileSheet>
  );
}
