import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, HardDriveDownload, Heart, Library } from 'lucide-react';
import { AlbumCoverArtImage } from '@/cover/AlbumCoverArtImage';
import { formatBytes } from '@/lib/format/formatBytes';
import { buildAlbumDetailPath, buildPlaylistDetailPath } from '@/lib/navigation/detailServerScope';
import { useConfirmModalStore } from '@/store/confirmModalStore';
import { useAuthStore } from '@/store/authStore';
import { useLocalPlaybackStore } from '@/store/localPlaybackStore';
import { resolveServerIdForIndexKey } from '@/lib/server/serverLookup';
import { showToast } from '@/lib/dom/toast';
import { IS_IOS } from '@/lib/util/platform';
import { useMobileActionSheetStore } from '@/features/mobileShell';
import {
  pinnedLibraryKey,
  useOfflineLibraryPinStore,
  type PinnedLibrary,
} from '@/features/offline/store/offlineLibraryPinStore';
import {
  estimateLibraryDownload,
  pinLibraryOffline,
  pinnedLibraryAlbumIds,
  resumeLibraryPin,
  unpinLibraryOffline,
} from '@/features/offline/utils/libraryOfflinePin';
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
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [estimating, setEstimating] = useState<string | null>(null);
  const activeServerId = useAuthStore(s => s.activeServerId);
  const musicFolders = useAuthStore(s => (s.activeServerId ? s.musicFoldersByServer[s.activeServerId] : undefined));
  const pinnedLibraries = useOfflineLibraryPinStore(s => s.libraries);
  const localPlaybackEntries = useLocalPlaybackStore(s => s.entries);

  const formatCount = (n: number) => n.toLocaleString(i18n.language);
  const unpinnedFolders = activeServerId
    ? (musicFolders ?? []).filter(folder => !pinnedLibraries[pinnedLibraryKey(activeServerId, folder.id)])
    : [];

  // Downloaded tracks per pinned library: its albums' library pins, counted
  // per server until the first pass knows which albums belong to it.
  const libraryRows = useMemo(() => {
    const groups = useLocalPlaybackStore.getState().listPinnedGroups()
      .filter(group => group.pinSource.kind === 'library');
    return Object.values(pinnedLibraries).map(pin => {
      const albumIds = pinnedLibraryAlbumIds(pin.serverId, pin.libraryId);
      let done = 0;
      for (const group of groups) {
        if ((resolveServerIdForIndexKey(group.serverIndexKey) || group.serverIndexKey) !== pin.serverId) continue;
        if (albumIds && !albumIds.has(group.pinSource.sourceId)) continue;
        done += group.trackIds.length;
      }
      return { pin, done: Math.min(done, pin.trackCount) };
    });
    // localPlaybackEntries is the recompute trigger; the groups are read from the store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedLibraries, localPlaybackEntries]);

  const startLibraryDownload = async () => {
    if (!activeServerId || unpinnedFolders.length === 0 || estimating) return;
    const sheet = useMobileActionSheetStore.getState();
    let folder = unpinnedFolders[0];
    if (unpinnedFolders.length > 1) {
      const choice = await sheet.request({
        title: t('connection.libraryDownloadPickTitle'),
        actions: unpinnedFolders.map(f => ({ id: f.id, label: f.name })),
      });
      const picked = unpinnedFolders.find(f => f.id === choice);
      if (!picked) return;
      folder = picked;
    }
    setEstimating(folder.name);
    let estimate;
    try {
      estimate = await estimateLibraryDownload(activeServerId, folder.id);
    } catch {
      showToast(t('connection.libraryDownloadEstimateFailed'), 6000, 'error');
      return;
    } finally {
      setEstimating(null);
    }
    if (estimate.trackCount === 0) {
      showToast(t('connection.libraryDownloadEmpty'), 6000, 'info');
      return;
    }
    const facts = {
      name: folder.name,
      count: formatCount(estimate.trackCount),
      size: formatBytes(estimate.totalBytes),
      free: estimate.freeBytes === null ? t('connection.libraryDownloadFreeUnknown') : formatBytes(estimate.freeBytes),
    };
    if (estimate.freeBytes !== null && estimate.totalBytes > estimate.freeBytes) {
      await sheet.request({
        title: t('connection.libraryDownloadTooLargeTitle'),
        message: t('connection.libraryDownloadTooLargeMessage', facts),
        actions: [{ id: 'close', label: t('common.close'), primary: true }],
      });
      return;
    }
    const answer = await sheet.request({
      title: t('connection.libraryDownloadConfirmTitle'),
      message: IS_IOS
        ? `${t('connection.libraryDownloadConfirmMessage', facts)}

${t('connection.libraryDownloadIosHint')}`
        : t('connection.libraryDownloadConfirmMessage', facts),
      actions: [
        { id: 'start', label: t('connection.libraryDownloadConfirm'), danger: true },
        { id: 'cancel', label: t('common.cancel') },
      ],
    });
    if (answer !== 'start') return;
    pinLibraryOffline({
      serverId: activeServerId,
      libraryId: folder.id,
      name: folder.name,
      trackCount: estimate.trackCount,
      totalBytes: estimate.totalBytes,
    });
  };

  const libraryActions = async (pin: PinnedLibrary) => {
    const choice = await useMobileActionSheetStore.getState().request({
      title: pin.name,
      actions: [
        ...(pin.pausedForSpace
          ? [{ id: 'resume', label: t('connection.libraryDownloadResume'), primary: true }]
          : []),
        { id: 'remove', label: t('connection.libraryDownloadRemove'), danger: true },
      ],
    });
    if (choice === 'resume') {
      resumeLibraryPin(pin.serverId, pin.libraryId);
      return;
    }
    if (choice !== 'remove') return;
    const confirmed = await useConfirmModalStore.getState().request({
      title: t('connection.removeDownloadTitle'),
      message: t('connection.removeLibraryDownloadMessage', { name: pin.name }),
      confirmLabel: t('connection.removeDownload'),
      cancelLabel: t('common.cancel'),
      danger: true,
    });
    if (confirmed) void unpinLibraryOffline(pin.serverId, pin.libraryId);
  };

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

      {(unpinnedFolders.length > 0 || estimating) && (
        <button
          type="button"
          className="mobile-share-row"
          disabled={!!estimating}
          onClick={() => void startLibraryDownload()}
        >
          <span className="mobile-share-cover mobile-share-row__cover"><Library size={22} aria-hidden="true" /></span>
          <span className="mobile-share-row__text">
            <span className="mobile-share-row__title">{t('connection.libraryDownloadButton')}</span>
            <span className="mobile-share-row__sub">
              <span className="mobile-share-row__details">
                {estimating
                  ? t('connection.libraryDownloadEstimating', { name: estimating })
                  : t('connection.libraryDownloadHint')}
              </span>
            </span>
          </span>
          <ChevronRight className="mobile-share-row__chevron" size={18} aria-hidden="true" />
        </button>
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
      ) : shown.length === 0 && favoritesTrackCount === 0 && libraryRows.length === 0 ? (
        <p className="mobile-downloads__empty">{t('connection.downloadsEmpty')}</p>
      ) : (
        <div className="mobile-downloads__list">
          {filter === 'all' && libraryRows.map(({ pin, done }) => (
            <button
              key={pinnedLibraryKey(pin.serverId, pin.libraryId)}
              type="button"
              className="mobile-share-row"
              onClick={() => void libraryActions(pin)}
              onContextMenu={e => {
                e.preventDefault();
                e.stopPropagation();
                void libraryActions(pin);
              }}
            >
              <span className="mobile-share-cover mobile-share-row__cover"><Library size={22} aria-hidden="true" /></span>
              <span className="mobile-share-row__text">
                <span className="mobile-share-row__title">{pin.name}</span>
                <span className="mobile-share-row__sub">
                  <span className="mobile-share-row__details">
                    {[
                      t('connection.downloadKindLibrary'),
                      pin.pausedForSpace
                        ? t('connection.libraryDownloadPaused')
                        : t('connection.libraryDownloadProgress', { done: formatCount(done), total: formatCount(pin.trackCount) }),
                    ].join(' · ')}
                  </span>
                </span>
              </span>
              <ChevronRight className="mobile-share-row__chevron" size={18} aria-hidden="true" />
            </button>
          ))}
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
