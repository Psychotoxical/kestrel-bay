import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, HardDriveDownload, Heart } from 'lucide-react';
import { AlbumCoverArtImage } from '@/cover/AlbumCoverArtImage';
import { formatBytes } from '@/lib/format/formatBytes';
import { buildAlbumDetailPath, buildPlaylistDetailPath } from '@/lib/navigation/detailServerScope';
import { useConfirmModalStore } from '@/store/confirmModalStore';
import {
  offlineAlbumCoverScope,
  offlineLibraryCardKey,
  offlineTrackCount,
  type OfflineLibraryCard,
} from '@/features/offline/utils/offlineLibraryHelpers';

const ROW_COVER_CSS_PX = 52;

type Filter = 'all' | OfflineLibraryCard['pinSource']['kind'];

interface Props {
  cards: OfflineLibraryCard[];
  loading: boolean;
  totalBytes: number | null;
  favoritesTrackCount: number;
  onDelete: (card: OfflineLibraryCard) => void;
}

function RowCover({ card }: { card: OfflineLibraryCard }) {
  const scope = offlineAlbumCoverScope(card);
  const quad = card.pinSource.kind === 'playlist' ? card.coverQuadIds : undefined;
  if (scope && quad?.some(Boolean)) {
    return (
      <span className="mobile-share-cover mobile-share-row__cover">
        <span className="playlist-cover-grid">
          {quad.map((coverId, i) => (coverId ? (
            <AlbumCoverArtImage
              key={`${coverId}-${i}`}
              albumId={coverId}
              coverArt={coverId}
              serverScope={scope}
              libraryResolve
              displayCssPx={ROW_COVER_CSS_PX / 2}
              surface="dense"
              className="playlist-cover-cell"
              alt=""
              loading="lazy"
            />
          ) : <span key={i} className="playlist-cover-cell playlist-cover-cell--empty" />))}
        </span>
      </span>
    );
  }
  return (
    <span className="mobile-share-cover mobile-share-row__cover">
      {scope && card.coverArt ? (
        <AlbumCoverArtImage
          albumId={card.pinSource.kind === 'playlist' ? card.coverArt : card.pinSource.sourceId}
          coverArt={card.coverArt}
          serverScope={scope}
          libraryResolve
          displayCssPx={ROW_COVER_CSS_PX}
          surface="dense"
          className="mobile-share-cover__image"
          alt=""
          loading="lazy"
        />
      ) : <HardDriveDownload size={22} aria-hidden="true" />}
    </span>
  );
}

/**
 * The Downloaded page in the touch shell: one row per downloaded album,
 * playlist or discography album. Tapping opens it; a long press asks to remove
 * the download. The space the downloads take sits under the title.
 */
export default function OfflineLibraryMobile({ cards, loading, totalBytes, favoritesTrackCount, onDelete }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');

  const kindOf = (card: OfflineLibraryCard): Filter => card.pinSource.kind ?? 'album';
  // Single-track pins have no filter of their own; they show under "All".
  const kinds = (['album', 'playlist', 'artist'] as const).filter(kind => cards.some(card => kindOf(card) === kind));
  const shown = filter === 'all' ? cards : cards.filter(card => kindOf(card) === filter);
  const filterLabels: Record<'all' | (typeof kinds)[number], string> = {
    all: t('connection.offlineFilterAll'),
    album: t('connection.offlineFilterAlbums'),
    playlist: t('connection.offlineFilterPlaylists'),
    artist: t('connection.offlineFilterArtists'),
  };

  const open = (card: OfflineLibraryCard) => {
    // A single-track pin has no page of its own.
    if (card.pinSource.kind === 'track') return;
    const options = { serverId: card.serverIndexKey };
    navigate(card.pinSource.kind === 'playlist'
      ? buildPlaylistDetailPath(card.pinSource.sourceId, options)
      : buildAlbumDetailPath(card.pinSource.sourceId, options));
  };

  const askRemove = async (card: OfflineLibraryCard) => {
    const confirmed = await useConfirmModalStore.getState().request({
      title: t('connection.removeDownloadTitle'),
      message: t('connection.removeDownloadMessage', { name: card.name }),
      confirmLabel: t('connection.removeDownload'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (confirmed) onDelete(card);
  };

  const subtitle = (card: OfflineLibraryCard) => {
    const tracks = t('albumDetail.tracksCount', { n: offlineTrackCount(card) });
    const kind = card.pinSource.kind === 'playlist' ? t('connection.downloadKindPlaylist')
      : card.pinSource.kind === 'artist' ? t('connection.downloadKindDiscography') : null;
    return [kind, card.artist || null, tracks].filter(Boolean).join(' · ');
  };

  return (
    <div className="mobile-page mobile-downloads">
      <h1 className="mobile-large-title">{t('connection.downloaded')}</h1>
      {totalBytes !== null && totalBytes > 0 && (
        <p className="mobile-downloads__usage">{t('connection.downloadsUsage', { size: formatBytes(totalBytes) })}</p>
      )}

      {kinds.length > 1 && (
        <div className="mobile-chips mobile-chips--scroll" role="group" aria-label={t('connection.downloaded')}>
          {(['all', ...kinds] as const).map(kind => (
            <button
              key={kind}
              type="button"
              className={`mobile-chip${filter === kind ? ' is-active' : ''}`}
              aria-pressed={filter === kind}
              onClick={() => setFilter(kind)}
            >
              {filterLabels[kind]}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="loading-center"><div className="spinner" /></div>
      ) : shown.length === 0 && favoritesTrackCount === 0 ? (
        <p className="mobile-downloads__empty">{t('connection.downloadsEmpty')}</p>
      ) : (
        <div className="mobile-downloads__list">
          {filter === 'all' && favoritesTrackCount > 0 && (
            <button type="button" className="mobile-share-row" onClick={() => navigate('/favorites')}>
              <span className="mobile-share-cover mobile-share-row__cover"><Heart size={22} aria-hidden="true" /></span>
              <span className="mobile-share-row__text">
                <span className="mobile-share-row__title">{t('connection.offlineFavoritesQueueTitle')}</span>
                <span className="mobile-share-row__sub">
                  <span className="mobile-share-row__details">{t('albumDetail.tracksCount', { n: favoritesTrackCount })}</span>
                </span>
              </span>
              <ChevronRight className="mobile-share-row__chevron" size={18} aria-hidden="true" />
            </button>
          )}
          {shown.map(card => (
            <button
              key={offlineLibraryCardKey(card)}
              type="button"
              className="mobile-share-row"
              onClick={() => open(card)}
              onContextMenu={e => {
                e.preventDefault();
                e.stopPropagation();
                void askRemove(card);
              }}
            >
              <RowCover card={card} />
              <span className="mobile-share-row__text">
                <span className="mobile-share-row__title">{card.name}</span>
                <span className="mobile-share-row__sub">
                  <span className="mobile-share-row__details">{subtitle(card)}</span>
                </span>
              </span>
              <ChevronRight className="mobile-share-row__chevron" size={18} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
