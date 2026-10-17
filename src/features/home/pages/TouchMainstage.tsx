import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Home from '@/features/home/pages/Home';
import Hero from '@/features/home/components/Hero';
import { AlbumRow } from '@/features/album';
import { useHomeStore, type HomeSectionId } from '@/features/home/store/homeStore';
import { deriveHomeFeedScope } from '@/features/home/pages/homeFeedLoader';
import { useOfflineBrowseActive } from '@/features/offline';
import { useOfflinePlayableCatalog } from '@/features/home/hooks/useOfflinePlayableCatalog';
import { useAuthStore } from '@/store/authStore';
import { useUnavailableServerIds } from '@/lib/network/serverReachability';
import { scheduleStartupSplashDismiss } from '@/app/startupSplash';

const HERO_ALBUM_COUNT = 8;
const ALBUM_ROW_ARTWORK_SIZE = 300;
const ALBUM_ROW_INITIAL_ARTWORK_BUDGET = 14;

/**
 * Offline Mainstage: only what plays from this device, built from local data
 * so it looks the same however long the server has been gone. The hero and
 * "Downloaded" show the downloads, "Recently played" every album on the
 * device that was played; nothing leads to a page that needs the server.
 */
function OfflineMainstage() {
  const { t } = useTranslation();
  const sections = useHomeStore(s => s.sections);
  const servers = useAuthStore(s => s.servers);
  const activeServerId = useAuthStore(s => s.activeServerId);
  const libraryBrowseServerIds = useAuthStore(s => s.libraryBrowseServerIds);
  const libraryBrowseSelectionByServer = useAuthStore(s => s.libraryBrowseSelectionByServer);
  const unavailableServerIds = useUnavailableServerIds();
  const serverIds = useMemo(() => {
    const { serverIds: scoped } = deriveHomeFeedScope({
      servers,
      activeServerId,
      libraryBrowseServerIds,
      libraryBrowseSelectionByServer,
    }, unavailableServerIds);
    return scoped.length > 0 ? scoped : activeServerId ? [activeServerId] : [];
  }, [activeServerId, libraryBrowseSelectionByServer, libraryBrowseServerIds, servers, unavailableServerIds]);
  const catalog = useOfflinePlayableCatalog(serverIds);

  useEffect(() => {
    scheduleStartupSplashDismiss();
  }, []);

  if (!catalog) return null;
  if (catalog.albums.length === 0) {
    return (
      <div className="content-body">
        <p className="mobile-downloads__empty">{t('connection.downloadsEmpty')}</p>
      </div>
    );
  }

  const isVisible = (id: HomeSectionId) => sections.find(s => s.id === id)?.visible ?? true;
  const heroAlbums = (catalog.downloadedAlbums.length > 0 ? catalog.downloadedAlbums : catalog.albums)
    .slice(0, HERO_ALBUM_COUNT);

  return (
    <div>
      {isVisible('hero') && <Hero albums={heroAlbums} />}
      <div className="content-body" style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
        <AlbumRow
          title={t('connection.downloaded')}
          titleLink="/offline"
          albums={catalog.downloadedAlbums}
          artworkSize={ALBUM_ROW_ARTWORK_SIZE}
          windowArtworkByViewport
          initialArtworkBudget={ALBUM_ROW_INITIAL_ARTWORK_BUDGET}
        />
        {isVisible('recentlyPlayed') && (
          <AlbumRow
            title={t('home.recentlyPlayed')}
            albums={catalog.recentlyPlayedAlbums}
            artworkSize={ALBUM_ROW_ARTWORK_SIZE}
            windowArtworkByViewport
            initialArtworkBudget={ALBUM_ROW_INITIAL_ARTWORK_BUDGET}
          />
        )}
      </div>
    </div>
  );
}

/** Touch shell Mainstage: the full feed online, only what plays from this device offline. */
export default function TouchMainstage() {
  return useOfflineBrowseActive() ? <OfflineMainstage /> : <Home />;
}
