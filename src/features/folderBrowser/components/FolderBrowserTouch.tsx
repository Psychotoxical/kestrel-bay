import type { SubsonicArtist, SubsonicDirectoryEntry } from '@/lib/api/subsonicTypes';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronRight, Disc3, Folder, MoreHorizontal, User } from 'lucide-react';
import { sameQueueTrack, usePlayerStore } from '@/features/playback';
import { useAuthStore } from '@/store/authStore';
import {
  albumDtoToFolderEntry, artistDtoToFolderEntry, entryToAlbumIfPresent, entryToTrack,
  folderBrowserEntryKey, trackDtoToFolderEntry, type ColumnKind,
} from '@/features/folderBrowser/utils/folderBrowserHelpers';
import {
  libraryScopeAlbumDetail,
  libraryScopeArtistDetail,
  libraryScopeListArtists,
} from '@/lib/api/library/scopeReads';
import { deriveEffectiveLibraryBrowseServerIds } from '@/lib/library/libraryBrowseScope';
import { useUnavailableServerIds } from '@/lib/network/serverReachability';
import { formatTrackTime } from '@/lib/format/formatDuration';
import { APP_MAIN_SCROLL_VIEWPORT_ID } from '@/constants/appScroll';
import { useVirtualizerScrollMargin } from '@/lib/hooks/useVirtualizerScrollMargin';

type Level = {
  key: string;
  title: string;
  kind: ColumnKind;
  items: SubsonicDirectoryEntry[];
  loading: boolean;
  error: boolean;
  serverId?: string;
  scopes?: { serverId: string; libraryId: string }[];
};

type FolderNavState = { folderDepth?: number } | null;

const ROW_ESTIMATE_PX = 56;

const KIND_ICON = { roots: Folder, artists: User, albums: Disc3, tracks: Folder } as const;

function scrollViewport(): HTMLElement | null {
  return document.getElementById(APP_MAIN_SCROLL_VIEWPORT_ID);
}

/**
 * Touch shell folder browser: one level per screen (library → artists → albums → tracks)
 * instead of the desktop's side-by-side columns. Each level is its own history entry,
 * so the shell's back button, Android back and the iOS edge swipe step up one level.
 * Same index reads and the same play path as the desktop columns.
 */
export default function FolderBrowserTouch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const depth = (location.state as FolderNavState)?.folderDepth ?? 0;

  const servers = useAuthStore(s => s.servers);
  const activeServerId = useAuthStore(s => s.activeServerId);
  const libraryBrowseServerIds = useAuthStore(s => s.libraryBrowseServerIds);
  const musicFoldersByServer = useAuthStore(s => s.musicFoldersByServer);
  const libraryBrowseSelectionByServer = useAuthStore(s => s.libraryBrowseSelectionByServer);
  const unavailableServerIds = useUnavailableServerIds();
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const playTrack = usePlayerStore(s => s.playTrack);
  const openContextMenu = usePlayerStore(s => s.openContextMenu);

  const rootItems = useMemo<SubsonicDirectoryEntry[]>(() => {
    const serverIds = new Set(deriveEffectiveLibraryBrowseServerIds({
      servers,
      activeServerId,
      libraryBrowseServerIds,
    }, unavailableServerIds));
    return servers.filter(server => serverIds.has(server.id)).flatMap(server => {
      const folders = musicFoldersByServer[server.id] ?? [];
      const selectedIds = libraryBrowseSelectionByServer[server.id] ?? [];
      return folders
        .filter(folder => selectedIds.length === 0 || selectedIds.includes(folder.id))
        .map(folder => ({
          id: folder.id,
          sourceId: folder.id,
          serverId: server.id,
          title: `${server.name} - ${folder.name}`,
          isDir: true,
        }));
    });
  }, [activeServerId, libraryBrowseSelectionByServer, libraryBrowseServerIds, musicFoldersByServer, servers, unavailableServerIds]);

  // Levels below the root; the root itself is derived from the server settings.
  const [stack, setStack] = useState<Level[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const scrollTops = useRef<Record<number, number>>({});
  const requestGeneration = useRef(0);

  const root: Level = useMemo(() => ({
    key: 'root',
    title: t('sidebar.folderBrowser'),
    kind: 'roots',
    items: rootItems,
    loading: false,
    error: false,
  }), [rootItems, t]);
  const levels = useMemo(() => [root, ...stack], [root, stack]);

  // A remount (leaving the page and coming back) loses the stack while the history
  // entry still carries its depth; start over at the root instead of showing a stale level.
  useEffect(() => {
    if (depth > stack.length) {
      navigate(location.pathname, { replace: true, state: { folderDepth: 0 } });
    }
  }, [depth, stack.length, navigate, location.pathname]);

  const shownDepth = Math.min(depth, levels.length - 1);
  const level = levels[shownDepth];
  const filter = filters[level.key] ?? '';

  // Restore the level's own scroll position when stepping back, start new levels at the top.
  useEffect(() => {
    const el = scrollViewport();
    if (el) el.scrollTop = scrollTops.current[shownDepth] ?? 0;
  }, [shownDepth, level.key]);

  const openDir = useCallback((item: SubsonicDirectoryEntry) => {
    const serverId = item.serverId ?? level.serverId;
    if (!serverId) return;
    const el = scrollViewport();
    scrollTops.current[shownDepth] = el?.scrollTop ?? 0;
    scrollTops.current[shownDepth + 1] = 0;
    const scopes = level.kind === 'roots'
      ? [{ serverId, libraryId: item.sourceId ?? item.id }]
      : level.scopes ?? [];
    const kind: ColumnKind = level.kind === 'roots' ? 'artists' : level.kind === 'artists' ? 'albums' : 'tracks';
    const key = `${shownDepth + 1}:${folderBrowserEntryKey(item)}`;
    const generation = ++requestGeneration.current;
    setStack(prev => [
      ...prev.slice(0, shownDepth),
      { key, title: item.title, kind, items: [], loading: true, error: false, serverId, scopes },
    ]);
    navigate(location.pathname, { state: { folderDepth: shownDepth + 1 } });

    const fetchItems = level.kind === 'roots'
      ? libraryScopeListArtists(serverId, { scopes, sort: 'name', limit: 10_000 })
        .then(artists => artists.map(artistDtoToFolderEntry))
      : level.kind === 'artists'
        ? libraryScopeArtistDetail(serverId, { scopes, artistId: item.id, serverId, includeTracks: false })
          .then(response => [...response.albums, ...response.appearsOnAlbums].map(albumDtoToFolderEntry))
        : libraryScopeAlbumDetail(serverId, { scopes, albumId: item.id, serverId })
          .then(response => response.tracks.map(trackDtoToFolderEntry));

    const settle = (patch: Partial<Level>) => setStack(prev => {
      if (requestGeneration.current !== generation) return prev;
      return prev.map(l => (l.key === key ? { ...l, ...patch, loading: false } : l));
    });
    fetchItems
      .then(items => settle({ items: items.map(entry => ({ ...entry, serverId: entry.serverId ?? serverId })) }))
      .catch(() => settle({ error: true }));
  }, [level, shownDepth, navigate, location.pathname]);

  const visibleItems = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return level.items;
    return level.items.filter(item =>
      `${item.title} ${item.artist ?? ''} ${item.album ?? ''}`.toLowerCase().includes(query));
  }, [level.items, filter]);

  const playFile = useCallback((item: SubsonicDirectoryEntry) => {
    const queue = visibleItems.filter(it => !it.isDir).map(entryToTrack);
    playTrack(entryToTrack(item), queue.length > 0 ? queue : [entryToTrack(item)]);
  }, [playTrack, visibleItems]);

  // Same menus as the desktop columns: artist, album, or song.
  const openMenu = useCallback((item: SubsonicDirectoryEntry, x: number, y: number) => {
    if (!item.isDir) {
      openContextMenu(x, y, entryToTrack(item), 'song');
      return;
    }
    if (level.kind === 'artists') {
      const artist: SubsonicArtist = { id: item.id, name: item.title, coverArt: item.coverArt, serverId: item.serverId };
      openContextMenu(x, y, artist, 'artist');
      return;
    }
    const album = entryToAlbumIfPresent(item);
    if (album) openContextMenu(x, y, album, 'album');
  }, [level.kind, openContextMenu]);

  const listWrapRef = useRef<HTMLDivElement | null>(null);
  const scrollMargin = useVirtualizerScrollMargin(listWrapRef, scrollViewport, {
    active: true,
    deps: [level.key, level.loading, visibleItems.length],
  });
  // React Compiler incompatible-library rule: third-party hook/value the compiler cannot analyze; usage is correct.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: scrollViewport,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 12,
    scrollMargin,
    initialOffset: () => scrollViewport()?.scrollTop ?? 0,
    getItemKey: i => folderBrowserEntryKey(visibleItems[i]),
  });

  const parentTitle = shownDepth > 0 ? levels[shownDepth - 1].title : null;
  const Icon = KIND_ICON[level.kind];

  return (
    <div className="mobile-page mobile-folder-browser">
      <h1 className="mobile-large-title">{level.title}</h1>
      {parentTitle && <p className="mobile-page-subtitle">{parentTitle}</p>}
      {level.items.length > 8 && (
        <input
          type="search"
          className="input-search mobile-folder-browser__filter"
          value={filter}
          placeholder={t('playlists.searchPlaceholder')}
          onChange={e => setFilters(prev => ({ ...prev, [level.key]: e.target.value }))}
        />
      )}

      {level.loading ? (
        <div className="mobile-folder-browser__status"><div className="spinner" /></div>
      ) : level.error ? (
        <div className="mobile-folder-browser__status">{t('folderBrowser.error')}</div>
      ) : visibleItems.length === 0 ? (
        <div className="mobile-folder-browser__status">{t('folderBrowser.empty')}</div>
      ) : (
        <div ref={listWrapRef} style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
          {virtualizer.getVirtualItems().map(vi => {
            const item = visibleItems[vi.index];
            const style: React.CSSProperties = {
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${vi.start - virtualizer.options.scrollMargin}px)`,
            };
            if (item.isDir) {
              return (
                <div key={vi.key} ref={virtualizer.measureElement} data-index={vi.index} style={style}>
                  <button
                    type="button"
                    className="mobile-list-row mobile-list-row--plain"
                    onClick={() => openDir(item)}
                    onContextMenu={e => {
                      e.preventDefault();
                      openMenu(item, e.clientX, e.clientY);
                    }}
                  >
                    <Icon className="mobile-list-row__icon" size={22} strokeWidth={1.8} aria-hidden="true" />
                    <span className="mobile-list-row__label">{item.title}</span>
                    <ChevronRight className="mobile-list-row__chevron" size={18} aria-hidden="true" />
                  </button>
                </div>
              );
            }
            const active = sameQueueTrack(currentTrack, item);
            return (
              <div key={vi.key} ref={virtualizer.measureElement} data-index={vi.index} style={style}>
                <div className={`mobile-track${active ? ' is-active' : ''}`} data-virtual-track-row="">
                  <button
                    type="button"
                    className="mobile-track__main"
                    aria-current={active ? 'true' : undefined}
                    onClick={() => playFile(item)}
                  >
                    <span className="mobile-track__num">
                      {active && isPlaying
                        ? <span className="mobile-playing-bars" aria-hidden="true"><span /><span /><span /></span>
                        : item.track ?? vi.index + 1}
                    </span>
                    <span className="mobile-track__text">
                      <span className="mobile-track__title">{item.title}</span>
                      {item.artist && <span className="mobile-track__artist">{item.artist}</span>}
                    </span>
                    <span className="mobile-track__time">{formatTrackTime(item.duration ?? 0)}</span>
                  </button>
                  <button
                    type="button"
                    className="mobile-track__more"
                    aria-label={`${t('player.moreOptions')}: ${item.title}`}
                    aria-haspopup="menu"
                    onClick={e => {
                      const r = e.currentTarget.getBoundingClientRect();
                      openMenu(item, r.right, r.bottom);
                    }}
                  >
                    <MoreHorizontal size={20} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
