import { useTranslation } from 'react-i18next';
import { Download, FileUp, HardDrive, Lightbulb, ListPlus, RefreshCw, Search, Share2, Shuffle, Sparkles } from 'lucide-react';
import { usePlaylistLayoutStore, type PlaylistLayoutItemConfig, type PlaylistLayoutItemId } from '@/features/playlist';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';
import { ActionBarLayoutCustomizer } from '@/features/settings/components/ActionBarLayoutCustomizer';

const PLAYLIST_LAYOUT_ICONS: Record<PlaylistLayoutItemId, typeof Search> = {
  shuffle:      Shuffle,
  enqueue:      ListPlus,
  share:        Share2,
  editRules:    Sparkles,
  refreshSmart: RefreshCw,
  addSongs:     Search,
  importCsv:    FileUp,
  downloadZip:  Download,
  offlineCache: HardDrive,
  suggestions:  Lightbulb,
};

const PLAYLIST_LAYOUT_LABEL_KEYS: Record<PlaylistLayoutItemId, string> = {
  shuffle:      'playlists.shuffle',
  enqueue:      'playlists.addToQueue',
  share:        'contextMenu.shareLink',
  editRules:    'playlists.editRules',
  refreshSmart: 'playlists.refreshSmart',
  addSongs:     'playlists.addSongs',
  importCsv:    'playlists.importCSV',
  downloadZip:  'playlists.downloadZip',
  offlineCache: 'playlists.cacheOffline',
  suggestions:  'playlists.suggestions',
};

/** Suggestions is a page section below the list, so it is toggled but not ordered with the bar. */
const FIXED_IDS: readonly PlaylistLayoutItemId[] = ['suggestions'];

/**
 * Not offered in the touch shell: its playlist menu always has shuffle and the
 * download, and it has no ZIP download.
 */
const TOUCH_HIDDEN_IDS: ReadonlySet<PlaylistLayoutItemId> = new Set(['shuffle', 'offlineCache', 'downloadZip']);

/** Puts the reordered visible items back into the slots of the full list, so the hidden ones keep their place. */
export function mergeReorderedItems(
  all: PlaylistLayoutItemConfig[],
  reordered: PlaylistLayoutItemConfig[],
  hidden: ReadonlySet<PlaylistLayoutItemId>,
): PlaylistLayoutItemConfig[] {
  const next = reordered[Symbol.iterator]();
  return all.map(item => (hidden.has(item.id) ? item : next.next().value ?? item));
}

export function PlaylistLayoutCustomizer() {
  const { t } = useTranslation();
  const items = usePlaylistLayoutStore(s => s.items);
  const setItems = usePlaylistLayoutStore(s => s.setItems);
  const toggleItem = usePlaylistLayoutStore(s => s.toggleItem);
  const shown = IS_MOBILE_SHELL ? items.filter(i => !TOUCH_HIDDEN_IDS.has(i.id)) : items;
  const onReorder = IS_MOBILE_SHELL
    ? (reordered: PlaylistLayoutItemConfig[]) => setItems(mergeReorderedItems(items, reordered, TOUCH_HIDDEN_IDS))
    : setItems;

  const labels = Object.fromEntries(
    Object.entries(PLAYLIST_LAYOUT_LABEL_KEYS).map(([id, key]) => [id, t(key)]),
  ) as Record<PlaylistLayoutItemId, string>;

  return (
    <ActionBarLayoutCustomizer
      items={shown}
      icons={PLAYLIST_LAYOUT_ICONS}
      labels={labels}
      reorderType="playlist_layout_reorder"
      onReorder={onReorder}
      onToggle={toggleItem}
      fixedIds={FIXED_IDS}
    />
  );
}
