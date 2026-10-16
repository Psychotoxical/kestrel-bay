import React, { useId } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2, X } from 'lucide-react';
import ServerSelect from '@/ui/ServerSelect';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';
import { useRadioEditForm, type RadioEditProps } from '@/features/radio/hooks/useRadioEditForm';
import RadioEditCover from '@/features/radio/components/RadioEditCover';
import RadioEditSheet from '@/features/radio/components/RadioEditSheet';

export default function RadioEditModal(props: RadioEditProps) {
  return IS_MOBILE_SHELL ? <RadioEditSheet {...props} /> : <RadioEditDialog {...props} />;
}

function RadioEditDialog(props: RadioEditProps) {
  const { station, serverOptions, onClose } = props;
  const { t } = useTranslation();
  const {
    name, setName, streamUrl, setStreamUrl, homepageUrl, setHomepageUrl,
    serverId, setRequestedServerId, coverPreview, coverRemoved, hasExistingCover, saving, canSave,
    coverInputRef, pickCover, handleFileChange, handleRemoveCover, handleSave,
  } = useRadioEditForm(props);
  const titleId = useId();

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  /* Portal to document.body: nested .content-body uses contain:paint — in-tree
   * modals are clipped when the station list is empty (short layout). Same pattern as RadioDirectoryModal. */
  return createPortal(
    <div
      className="modal-overlay"
      style={{ alignItems: 'center', paddingTop: 0, overflowY: 'auto' }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="modal-content"
        style={{ maxWidth: 440, width: '90%', maxHeight: 'none', overflow: 'visible' }}
        onClick={e => e.stopPropagation()}
      >
        <button className="btn btn-ghost modal-close" onClick={onClose} aria-label={t('common.close')} style={{ top: 16, right: 16 }}>
          <X size={18} />
        </button>

        <h2 id={titleId} className="modal-title" style={{ fontSize: 20 }}>
          {station ? t('radio.editStation') : t('radio.addStation')}
        </h2>

        {/* Cover + fields side by side */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
          {/* Cover */}
          <div
            className="playlist-edit-cover-wrap"
            style={{ width: 140, height: 140 }}
            onClick={pickCover}
          >
            <RadioEditCover station={station} coverPreview={coverPreview} coverRemoved={coverRemoved} size={140} />
            <div className="playlist-edit-cover-overlay">
              <div className="playlist-edit-cover-menu">
                <button
                  className="playlist-edit-cover-menu-item"
                  onClick={e => { e.stopPropagation(); pickCover(); }}
                >
                  <Camera size={13} />
                  {t('radio.changeCoverLabel')}
                </button>
                {hasExistingCover && (
                  <button
                    className="playlist-edit-cover-menu-item playlist-edit-cover-menu-item--danger"
                    onClick={handleRemoveCover}
                  >
                    {t('radio.removeCover')}
                  </button>
                )}
              </div>
            </div>
            <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>

          {/* Fields */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!station && (
              <ServerSelect
                value={serverId}
                options={serverOptions}
                onChange={setRequestedServerId}
                disabled={saving}
                style={{ width: '100%' }}
              />
            )}
            <input
              className="input"
              style={{ fontSize: 15, fontWeight: 600 }}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('radio.stationName')}
              aria-label={t('radio.stationName')}
              autoFocus
            />
            <input
              className="input"
              value={streamUrl}
              onChange={e => setStreamUrl(e.target.value)}
              placeholder={t('radio.streamUrl')}
              aria-label={t('radio.streamUrl')}
            />
            <input
              className="input"
              value={homepageUrl}
              onChange={e => setHomepageUrl(e.target.value)}
              placeholder={t('radio.homepageUrl')}
              aria-label={t('radio.homepageUrl')}
            />
          </div>
        </div>

        <div className="playlist-edit-footer">
          <div />
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!canSave}
          >
            {saving ? <Loader2 size={14} className="spin-slow" /> : null}
            {t('radio.save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
