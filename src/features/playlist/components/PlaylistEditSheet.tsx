import { useTranslation } from 'react-i18next';
import { Camera, Loader2 } from 'lucide-react';
import { MobileSheet } from '@/features/mobileShell';
import { usePlaylistEditForm, type PlaylistEditProps } from '@/features/playlist/hooks/usePlaylistEditForm';
import PlaylistEditCover from '@/features/playlist/components/PlaylistEditCover';

/**
 * Touch layout of the playlist edit dialog: a bottom sheet with the cover on
 * top, the text fields as one grouped list, the public switch as a list row and
 * a full-width save button. No autofocus, so the keyboard stays down until a
 * field is tapped.
 */
export default function PlaylistEditSheet({
  playlist, customCoverId, coverQuadIds, onClose, onSave,
}: PlaylistEditProps) {
  const { t } = useTranslation();
  const {
    name, setName, comment, setComment, isPublic, setIsPublic,
    coverPreview, coverRemoved, hasExistingCover, saving, canSave,
    coverInputRef, pickCover, handleFileChange, handleRemoveCover, handleSave,
  } = usePlaylistEditForm(playlist, customCoverId, onSave);

  return (
    <MobileSheet title={t('playlists.editMeta')} onClose={onClose} className="mobile-sheet--playlist-edit">
      <div className="mobile-playlist-edit__cover-block">
        <button
          type="button"
          className="mobile-playlist-edit__cover"
          onClick={pickCover}
          aria-label={t('playlists.changeCoverLabel')}
        >
          <PlaylistEditCover
            coverPreview={coverPreview}
            coverRemoved={coverRemoved}
            customCoverId={customCoverId}
            coverQuadIds={coverQuadIds}
          />
          <span className="mobile-playlist-edit__cover-badge" aria-hidden="true">
            <Camera size={18} />
          </span>
        </button>
        <div className="mobile-playlist-edit__cover-actions">
          <button type="button" className="mobile-playlist-edit__link" onClick={pickCover}>
            {t('playlists.changeCoverLabel')}
          </button>
          {hasExistingCover && (
            <button
              type="button"
              className="mobile-playlist-edit__link mobile-playlist-edit__link--danger"
              onClick={handleRemoveCover}
            >
              {t('playlists.removeCover')}
            </button>
          )}
        </div>
        <input ref={coverInputRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
      </div>

      <div className="mobile-form-group">
        <input
          className="mobile-form-group__input"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('playlists.editNamePlaceholder')}
          aria-label={t('playlists.editNamePlaceholder')}
          enterKeyHint="done"
        />
        <textarea
          className="mobile-form-group__input mobile-form-group__input--multiline"
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder={t('playlists.editCommentPlaceholder')}
          aria-label={t('playlists.editCommentPlaceholder')}
        />
      </div>

      <div className="mobile-form-group">
        <label className="mobile-form-group__row">
          <span>{t('playlists.editPublic')}</span>
          <span className="toggle-switch">
            <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
            <span className="toggle-track" />
          </span>
        </label>
      </div>

      <button
        type="button"
        className="btn btn-primary mobile-playlist-edit__save"
        onClick={handleSave}
        disabled={!canSave}
      >
        {saving ? <Loader2 size={16} className="spin-slow" /> : null}
        {t('playlists.editSave')}
      </button>
    </MobileSheet>
  );
}
