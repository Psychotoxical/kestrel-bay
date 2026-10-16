import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Check, HardDriveDownload, Heart, ListPlus, MoreHorizontal, Play, Radio, Shuffle, Users } from 'lucide-react';
import { ArtistHeroCover } from '@/cover/artistHero';
import { useOfflineStore, offlineActionPolicy } from '@/features/offline';
import { ShareMethodMenuButton } from '@/features/share';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { useArtistOfflineState } from '@/features/artist/hooks/useArtistOfflineState';
import { useArtistHeaderBackdrop } from '@/features/artist/hooks/useArtistHeaderBackdrop';
import { lastFmArtistUrl } from '@/features/artist/utils/lastFmArtistUrl';
import type { ArtistDetailHeroProps } from '@/features/artist/components/ArtistDetailHero';
import { MobileBackButton } from '@/features/mobileShell';
import { useAuthStore } from '@/store/authStore';
import StarRating from '@/ui/StarRating';
import EntitySourcePicker from '@/ui/EntitySourcePicker';
import LastfmIcon from '@/ui/LastfmIcon';
import WikipediaIcon from '@/ui/WikipediaIcon';
import { prepareTransientUiOpen } from '@/lib/dom/transientUi';
import { buildArtistDetailPath } from '@/lib/navigation/detailServerScope';
import { useFitTextToWidth } from '@/lib/hooks/useFitTextToWidth';

/**
 * Artist page header in the touch shell: image card with the name, play /
 * shuffle, one swipeable row of further actions. Same props and handlers as
 * the desktop hero.
 */
export default function ArtistDetailHeroMobile({
  artist, id, albums, info, isStarred, artistEntityRating, handleArtistEntityRating,
  toggleStar, handlePlayAll, handleShuffle, handleEnqueueAll, handleStartRadio,
  playAllLoading, radioLoading, openLink,
  coverId, coverRef, coverRevision, headerCoverFailed, setHeaderCoverFailed,
  actionPolicy, serverId, sourceScopes = [], sourceServers = [], sourceMusicFoldersByServer = {},
}: ArtistDetailHeroProps) {
  const policy = actionPolicy ?? offlineActionPolicy('artistDetail', false);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const openContextMenu = usePlayerStore(s => s.openContextMenu);
  const downloadArtist = useOfflineStore(s => s.downloadArtist);
  const artistAlbumIds = useMemo(() => albums.map(a => a.id), [albums]);
  const { status: offlineStatus } = useArtistOfflineState(id ?? '', serverId, artistAlbumIds);
  const ratingSupport = useAuthStore(s => s.entityRatingSupportByServer[serverId] ?? 'unknown');
  const backdrop = useArtistHeaderBackdrop(artist, albums, coverRef);
  const fitNameRef = useFitTextToWidth(true, 34, 20);

  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(artist.name)}`;
  const lastFmUrl = lastFmArtistUrl(info?.lastFmUrl, artist.name);
  const showBackdrop = backdrop.enabled && !!backdrop.url;
  const hasAlbums = albums.length > 0;

  // The top row is a sibling of the header block so it stays sticky for the whole page.
  return (
    <>
      <div className="mobile-album__top">
        <MobileBackButton variant="round" />
        <div className="mobile-album__top-actions">
          {policy.canFavorite && (
            <button
              type="button"
              className={`mobile-round-btn${isStarred ? ' is-active' : ''}`}
              onClick={() => { void toggleStar(); }}
              aria-pressed={isStarred}
              aria-label={isStarred ? t('artistDetail.favoriteRemove') : t('artistDetail.favoriteAdd')}
            >
              <Heart size={21} fill={isStarred ? 'currentColor' : 'none'} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="mobile-round-btn"
            aria-label={t('player.moreOptions')}
            aria-haspopup="menu"
            onClick={e => {
              prepareTransientUiOpen();
              const r = e.currentTarget.getBoundingClientRect();
              openContextMenu(r.right, r.bottom, artist, 'artist');
            }}
          >
            <MoreHorizontal size={22} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mobile-artist">
        <div className="mobile-artist__hero">
          {showBackdrop ? (
            <div
              className="mobile-artist__image"
              style={{ backgroundImage: `url(${backdrop.url})`, backgroundPosition: backdrop.position }}
              aria-hidden="true"
            />
          ) : coverId && !headerCoverFailed ? (
            <ArtistHeroCover
              key={coverRevision}
              artistId={id ?? artist.id}
              artistInfo={info}
              coverFallback={coverRef}
              displayCssPx={600}
              surface="sparse"
              alt=""
              className="mobile-artist__image"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={() => setHeaderCoverFailed(true)}
            />
          ) : (
            <span className="mobile-artist__image mobile-artist__image--empty" aria-hidden="true">
              <Users size={64} />
            </span>
          )}
          <div className="mobile-artist__title">
            <h1 className="mobile-artist__name" ref={fitNameRef}>{artist.name}</h1>
            <span className="mobile-artist__count">
              {t('artistDetail.albumCount_other', { count: artist.albumCount ?? 0 })}
            </span>
          </div>
        </div>

        <EntitySourcePicker
          entityType="artist"
          anchorServerId={artist.serverId ?? serverId}
          anchorId={artist.id}
          scopes={sourceScopes}
          servers={sourceServers}
          musicFoldersByServer={sourceMusicFoldersByServer}
          onSelect={source => navigate(buildArtistDetailPath(source.id, {
            serverId: source.serverId,
            search: location.search,
          }))}
        />

        <div className="mobile-artist__rating">
          <span>{t('entityRating.artistShort')}</span>
          <StarRating
            value={artistEntityRating}
            onChange={handleArtistEntityRating}
            disabled={!policy.canRate || ratingSupport === 'track_only'}
            labelKey="entityRating.artistAriaLabel"
          />
        </div>

        {hasAlbums && (
          <div className="mobile-album__buttons">
            <button
              type="button"
              className="mobile-album__btn mobile-album__btn--primary"
              onClick={handlePlayAll}
              disabled={playAllLoading}
            >
              <Play size={18} fill="currentColor" aria-hidden="true" />
              {t('common.play')}
            </button>
            <button type="button" className="mobile-album__btn" onClick={handleShuffle} disabled={playAllLoading}>
              <Shuffle size={19} aria-hidden="true" />
              {t('albumDetail.shuffle')}
            </button>
          </div>
        )}

        <div className="mobile-chip-row mobile-artist__actions">
          <button type="button" className="btn btn-surface" onClick={handleStartRadio} disabled={radioLoading}>
            <Radio size={16} aria-hidden="true" />
            <span>{radioLoading ? t('artistDetail.loading') : t('artistDetail.radio')}</span>
          </button>
          {hasAlbums && (
            <button type="button" className="btn btn-surface" onClick={handleEnqueueAll} disabled={playAllLoading}>
              <ListPlus size={16} aria-hidden="true" />
              <span>{t('artistDetail.enqueue')}</span>
            </button>
          )}
          {id && (
            <ShareMethodMenuButton
              request={{ kind: 'artist', resourceIds: [artist.id], serverIds: [artist.serverId ?? serverId].filter(Boolean) }}
              className="btn btn-surface"
              label={t('artistDetail.shareArtist')}
            />
          )}
          {policy.canCacheDiscography && hasAlbums && (
            <button
              type="button"
              className={`btn btn-surface${offlineStatus === 'cached' ? ' btn-sort-active' : ''}`}
              disabled={offlineStatus === 'downloading' || offlineStatus === 'queued' || offlineStatus === 'cached'}
              onClick={() => { if (id && offlineStatus !== 'cached') downloadArtist(id, artist.name, serverId); }}
            >
              {offlineStatus === 'cached' ? <Check size={16} aria-hidden="true" /> : <HardDriveDownload size={16} aria-hidden="true" />}
              <span>{offlineStatus === 'cached' ? t('artistDetail.offlineCached') : t('artistDetail.cacheOffline')}</span>
            </button>
          )}
          {lastFmUrl && (
            <button type="button" className="btn btn-surface" onClick={() => openLink(lastFmUrl, 'lastfm')}>
              <LastfmIcon size={14} />
              <span>Last.fm</span>
            </button>
          )}
          <button type="button" className="btn btn-surface" onClick={() => openLink(wikiUrl, 'wiki')}>
            <WikipediaIcon size={14} />
            <span>Wikipedia</span>
          </button>
        </div>
      </div>
    </>
  );
}
