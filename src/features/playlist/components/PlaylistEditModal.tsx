import React from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2, X } from 'lucide-react';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';
import { usePlaylistEditForm, type PlaylistEditProps } from '@/features/playlist/hooks/usePlaylistEditForm';
import PlaylistEditCover from '@/features/playlist/components/PlaylistEditCover';
import PlaylistEditSheet from '@/features/playlist/components/PlaylistEditSheet';

export default function PlaylistEditModal(props: PlaylistEditProps) {
  return IS_MOBILE_SHELL ? <PlaylistEditSheet {...props} /> : <PlaylistEditDialog {...props} />;
}

function PlaylistEditDialog({
  playlist, customCoverId, coverQuadIds, onClose, onSave,
}: PlaylistEditProps) {
  const { t } = useTranslation();
  const {
    name, setName, comment, setComment, isPublic, setIsPublic,
    coverPreview, coverRemoved, hasExistingCover, saving, canSave,
    coverInputRef, pickCover, handleFileChange, handleRemoveCover, handleSave,
  } = usePlaylistEditForm(playlist, customCoverId, onSave);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content playlist-edit-modal" onClick={e => e.stopPropagation()}>
        <button className="btn btn-ghost modal-close" onClick={onClose} style={{ top: 16, right: 16 }}>
          <X size={18} />
        </button>

        <h2 className="modal-title" style={{ fontSize: 22 }}>{t('playlists.editMeta')}</h2>

        <div className="playlist-edit-body">
          {/* Left: cover */}
          <div
            className="playlist-edit-cover-wrap"
            onClick={pickCover}
          >
            <PlaylistEditCover
              coverPreview={coverPreview}
              coverRemoved={coverRemoved}
              customCoverId={customCoverId}
              coverQuadIds={coverQuadIds}
            />
            <div className="playlist-edit-cover-overlay">
              <div className="playlist-edit-cover-menu">
                <button
                  className="playlist-edit-cover-menu-item"
                  onClick={e => { e.stopPropagation(); pickCover(); }}
                >
                  <Camera size={14} />
                  {t('playlists.changeCoverLabel')}
                </button>
                {hasExistingCover && (
                  <button
                    className="playlist-edit-cover-menu-item playlist-edit-cover-menu-item--danger"
                    onClick={handleRemoveCover}
                  >
                    {t('playlists.removeCover')}
                  </button>
                )}
              </div>
            </div>
            <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>

          {/* Right: fields */}
          <div className="playlist-edit-fields">
            <input
              className="input playlist-edit-name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('playlists.editNamePlaceholder')}
              autoFocus
            />
            <textarea
              className="input playlist-edit-desc-input"
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={t('playlists.editCommentPlaceholder')}
            />
          </div>
        </div>

        <div className="playlist-edit-footer">
          <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <label className="toggle-switch" style={{ marginBottom: 0 }}>
              <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
              <span className="toggle-track" />
            </label>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{t('playlists.editPublic')}</span>
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-surface" onClick={onClose}>
              {t('playlists.editCancel')}
            </button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
              {saving ? <Loader2 size={14} className="spin-slow" /> : null}
              {t('playlists.editSave')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
