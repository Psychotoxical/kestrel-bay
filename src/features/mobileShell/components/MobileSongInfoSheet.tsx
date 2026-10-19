import { useTranslation } from 'react-i18next';
import { SongInfoRows, useSongInfoData } from '@/features/playback';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';

/**
 * Touch shell: the Song Info dialog as a bottom sheet (like the queue and lyrics
 * sheets) instead of the desktop dialog. Same rows; Title, Artist and Album copy with a tap.
 */
export default function MobileSongInfoSheet() {
  const { t } = useTranslation();
  const { isOpen, close, song, enrichment, loading, absolutePath } = useSongInfoData();

  if (!isOpen) return null;

  return (
    <MobileSheet title={t('songInfo.title')} onClose={close} className="mobile-sheet--song-info">
      {loading && <p className="song-info-loading">{t('common.loading')}</p>}
      {!loading && song && (
        <table className="song-info-table song-info-table--touch">
          <tbody>
            <SongInfoRows song={song} enrichment={enrichment} absolutePath={absolutePath} copyGesture="click" />
          </tbody>
        </table>
      )}
    </MobileSheet>
  );
}
