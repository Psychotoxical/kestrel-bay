import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSongInfoData } from '@/features/playback/hooks/useSongInfoData';
import SongInfoRows from '@/features/playback/components/SongInfoRows';

export default function SongInfoModal() {
  const { t } = useTranslation();
  const { isOpen, close, song, enrichment, loading, absolutePath } = useSongInfoData();

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  if (!isOpen) return null;

  return createPortal(
    <>
      <div className="song-info-backdrop" onClick={close} />
      <div className="song-info-modal" role="dialog" aria-modal="true" aria-label={t('songInfo.title')}>
        <div className="song-info-header">
          <span className="song-info-title">{t('songInfo.title')}</span>
          <button className="btn btn-ghost song-info-close" onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="song-info-body">
          {loading && <div className="song-info-loading">{t('common.loading')}</div>}

          {!loading && song && (
            <table className="song-info-table">
              <tbody>
                <SongInfoRows song={song} enrichment={enrichment} absolutePath={absolutePath} copyGesture="dblclick" />
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
