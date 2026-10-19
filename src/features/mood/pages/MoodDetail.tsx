import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { ArrowLeft } from 'lucide-react';
import {
  useLocation,
  useNavigate,
  useParams,
} from 'react-router';
import { useTranslation } from 'react-i18next';

import {
  AlbumCard,
  useAlbumBrowseScrollRestore,
  useAlbumBrowseScrollSnapshotSync,
  type AlbumBrowseScrollSnapshot,
  AlbumTable,
} from '@/features/album';
import { MobileGridLayoutMenu, useMobileGridLayout } from '@/features/mobileShell';
import { MOOD_DETAIL_INPAGE_SCROLL_VIEWPORT_ID, } from '@/constants/appScroll';
import { albumGridWarmCovers } from '@/cover/layoutSizes';
import { useInpageScrollViewport } from '@/lib/hooks/useInpageScrollViewport';
import { useMainstageInpageHeaderTight } from '@/lib/hooks/useMainstageInpageHeaderTight';
import { deriveLibraryBrowseScope } from '@/lib/library/libraryBrowseScope';
import { fetchMoodAlbumTotal } from '@/lib/library/moodAlbumBrowse';
import { usePerfProbeFlags } from '@/lib/perf/perfFlags';
import { useUnavailableServerIds } from '@/lib/network/serverReachability';
import { useAuthStore } from '@/store/authStore';
import { useLibraryIndexStore } from '@/store/libraryIndexStore';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';
import InpageScrollSentinel from '@/ui/InpageScrollSentinel';
import OverlayScrollArea from '@/ui/OverlayScrollArea';
import { VirtualCardGrid } from '@/ui/VirtualCardGrid';
import { useMoodAlbumBrowse } from '../hooks/useMoodAlbumBrowse';
import { readAlbumBrowseRestore, } from '@/lib/navigation/albumDetailNavigation';
import { useMoodDetailBrowse, } from '../hooks/useMoodDetailBrowse';

/** The touch album list here offers no selection. */
const NO_SELECTION: Set<string> = new Set();

export default function MoodDetail() {
  const { name } =
    useParams<{ name: string }>();

  const mood = name ?? '';

  const { t } = useTranslation();
  // Touch: the header switch (2 / 3 covers or the album list).
  const mobileGrid = useMobileGridLayout('mood');
  const forcedGridCols = IS_MOBILE_SHELL ? mobileGrid.columns : undefined;
  const mobileList = IS_MOBILE_SHELL && mobileGrid.isList;
  const navigate = useNavigate();
  const location = useLocation();
  const perfFlags = usePerfProbeFlags();

  const musicLibraryFilterVersion =
    useAuthStore(
      state =>
        state.musicLibraryFilterVersion,
    );

  const activeServerId =
    useAuthStore(
      state =>
        state.activeServerId ?? '',
    );

  const servers =
    useAuthStore(state => state.servers);

  const libraryBrowseServerIds =
    useAuthStore(
      state =>
        state.libraryBrowseServerIds,
    );

  const musicFoldersByServer =
    useAuthStore(
      state =>
        state.musicFoldersByServer,
    );

  const libraryBrowseSelectionByServer =
    useAuthStore(
      state =>
        state.libraryBrowseSelectionByServer,
    );

  const unavailableServerIds =
    useUnavailableServerIds();

  const browseScope = useMemo(
    () =>
      deriveLibraryBrowseScope(
        {
          servers,
          activeServerId:
            activeServerId || null,
          libraryBrowseServerIds,
          musicFoldersByServer,
          libraryBrowseSelectionByServer,
        },
        unavailableServerIds,
      ),
    [
      activeServerId,
      libraryBrowseSelectionByServer,
      libraryBrowseServerIds,
      musicFoldersByServer,
      servers,
      unavailableServerIds,
    ],
  );

  const serverId =
    browseScope.anchorServerId ??
    activeServerId;

  const indexEnabled =
    useLibraryIndexStore(state =>
      state.isIndexEnabled(serverId),
    );

  const scrollSnapshotRef =
    useRef<AlbumBrowseScrollSnapshot>({
      scrollTop: 0,
      displayCount: 0,
    });

  const {
    sort,
    restoreDisplayCount,
  } = useMoodDetailBrowse(
    serverId,
    mood,
    scrollSnapshotRef,
  );

  const {
    scrollBodyEl,
    bindScrollBody,
    getScrollRoot,
  } = useInpageScrollViewport();

  const {
    albums,
    loading,
    loadingMore,
    hasMore,
    displayAlbums,
    bindLoadMoreSentinel,
    loadMore,
  } = useMoodAlbumBrowse(
    serverId,
    mood,
    indexEnabled,
    sort,
    musicLibraryFilterVersion,
    browseScope,
    getScrollRoot,
    scrollBodyEl,
    restoreDisplayCount,
  );
  useAlbumBrowseScrollSnapshotSync(
  scrollSnapshotRef,
  scrollBodyEl,
  displayAlbums.length,
);

const {
  isScrollRestorePending,
} = useAlbumBrowseScrollRestore({
  serverId,
  moodName: mood,
  scrollBodyEl,
  displayAlbumsLength:
    displayAlbums.length,
  loading,
  loadingMore,
  hasMore,
  loadMore,
});

useEffect(() => {
  if (
    isScrollRestorePending ||
    !readAlbumBrowseRestore(
      location.state,
    )
  ) {
    return;
  }

  navigate(
    `${location.pathname}${location.search}${location.hash}`,
    {
      replace: true,
      state: null,
    },
  );
}, [
  isScrollRestorePending,
  location.pathname,
  location.search,
  location.hash,
  location.state,
  navigate,
]);

  const [albumCount, setAlbumCount] =
    useState<number | null>(null);

  useEffect(() => {
    if (
      !mood ||
      !serverId ||
      !indexEnabled
    ) {
      return;
    }

    let cancelled = false;

    // React Compiler set-state-in-effect rule:
    // count belongs to the current mood route.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAlbumCount(null);

    const timer =
      window.setTimeout(() => {
        void fetchMoodAlbumTotal(
          serverId,
          mood,
          indexEnabled,
          sort,
          browseScope,
        ).then(count => {
          if (!cancelled) {
            setAlbumCount(count);
          }
        });
      }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    serverId,
    mood,
    indexEnabled,
    sort,
    browseScope,
    musicLibraryFilterVersion,
  ]);

  const headerCount =
    albumCount ??
    (
      !loading && !hasMore
        ? albums.length
        : null
    );

  const handleBack =
    useCallback(() => {
      const state =
        location.state as
          | { returnTo?: string }
          | null;

      navigate(
        state?.returnTo ?? '/moods',
      );
    }, [location.state, navigate]);

  const mainstageHeaderTight =
    useMainstageInpageHeaderTight(
      scrollBodyEl,
      [mood, headerCount],
    );

  return (
    <div
      className={
        `content-body animate-fade-in mainstage-inpage-split${
          mainstageHeaderTight
            ? ' mainstage-inpage--header-tight'
            : ''
        }`
      }
    >
      {IS_MOBILE_SHELL ? (
        // Touch: the shell's back bar leads back; title and count as on the genre page.
        <div className="mobile-browse-header">
          <div className="mobile-browse-header__top">
            <h1 className="mobile-large-title">{mood}</h1>
            <div className="mobile-browse-header__actions">
              <MobileGridLayoutMenu surface="mood" scrollRootId={MOOD_DETAIL_INPAGE_SCROLL_VIEWPORT_ID} />
            </div>
          </div>
          {headerCount != null && headerCount > 0 && (
            <p className="mobile-page-subtitle">{t('moods.albumCount', { count: headerCount })}</p>
          )}
        </div>
      ) : (
      <div className="mainstage-inpage-toolbar">
        <div className="page-sticky-header mainstage-inpage-toolbar-row">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleBack}
            aria-label={t('moods.back', )}
            data-tooltip={t(
              'moods.back',
            )}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              marginRight: '0.25rem',
            }}
          >
            <ArrowLeft size={16} />

            <span className="toolbar-btn-label">
              {t('moods.back', )}
            </span>
          </button>

          <div className="psy-page-heading psy-page-heading--fill">
            <h1
              className="page-title truncate"
              title={mood}
            >
              {mood}
            </h1>

            {headerCount != null &&
              headerCount > 0 && (
                <span className="psy-page-heading__count">
                  <span aria-hidden="true">
                    –
                  </span>

                  {t(
                    'moods.albumCount',
                    {
                      count:
                        headerCount,
                      },
                  )}
                </span>
              )}
          </div>
        </div>
      </div>
      )}

      <OverlayScrollArea
        className="mainstage-inpage-scroll"
        viewportClassName="mainstage-inpage-scroll__viewport"
        viewportId={
          MOOD_DETAIL_INPAGE_SCROLL_VIEWPORT_ID
        }
        viewportRef={bindScrollBody}
        railInset="panel"
        measureDeps={[
          loading,
          displayAlbums.length,
          hasMore,
          mood,
          perfFlags.disableMainstageVirtualLists,
        ]}
      >
        {loading &&
        albums.length === 0 ? (
          <div
            style={{
              display: 'flex',
              justifyContent:
                'center',
              padding: '3rem',
            }}
          >
            <div className="spinner" />
          </div>
        ) : !loading &&
          displayAlbums.length === 0 ? (
          <p
            className="loading-text"
            style={{
              padding: '3rem 1rem',
              textAlign: 'center',
            }}
          >
            {t('moods.albumsEmpty', )}
          </p>
        ) : (
          <div
            style={{
              position: 'relative',
            }}
          >
            <div
              style={{
                visibility:
                  isScrollRestorePending
                    ? 'hidden'
                    : 'visible',
              }}
            >
              {mobileList ? (
                <AlbumTable
                  albums={displayAlbums}
                  itemKey={album => album.id}
                  scrollRootId={MOOD_DETAIL_INPAGE_SCROLL_VIEWPORT_ID}
                  disableVirtualization={perfFlags.disableMainstageVirtualLists}
                  selectionMode={false}
                  selectedIds={NO_SELECTION}
                  onToggleSelect={() => {}}
                  selectedAlbums={[]}
                />
              ) : (
                <VirtualCardGrid
                  columns={forcedGridCols}
                  wrapClassName={forcedGridCols ? `album-grid-wrap mobile-grid-cols-${forcedGridCols}` : undefined}
                  items={displayAlbums}
                  itemKey={(album, _index) =>
                    album.id
                  }
                  rowVariant="album"
                  disableVirtualization={
                    perfFlags.disableMainstageVirtualLists
                  }
                  layoutSignal={
                    displayAlbums.length
                  }
                  scrollRootId={
                    MOOD_DETAIL_INPAGE_SCROLL_VIEWPORT_ID
                  }
                  warmGridCovers={
                    albumGridWarmCovers()
                  }
                  renderItem={album => (
                    <AlbumCard
                      album={album}
                      observeScrollRootId={
                        MOOD_DETAIL_INPAGE_SCROLL_VIEWPORT_ID
                      }
                    />
                  )}
                />
              )}

              {hasMore && (
                <InpageScrollSentinel
                  bindSentinel={
                    bindLoadMoreSentinel
                  }
                  loading={loadingMore}
                  itemCount={
                    displayAlbums.length
                  }
                />
              )}
            </div>

            {isScrollRestorePending && (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      justifyContent: 'center',
      paddingTop: '3rem',
      background: 'var(--bg-app)',
    }}
  >
    <div className="spinner" />
  </div>
)}
</div>
)}
</OverlayScrollArea>
</div>
);
}