import { useSidebarStore } from '@/features/sidebar/store/sidebarStore';
import { useAuthStore } from '@/store/authStore';
import { ALL_NAV_ITEMS, type NavItemMeta } from '@/config/navItems';
import { useLuckyMixAvailable } from '@/features/randomMix';
import { isOfflineSidebarNavAllowed } from '@/features/offline';
import { useReactiveOfflineBrowseContext } from '@/features/sidebar/hooks/useReactiveOfflineBrowseContext';
import { offlineBrowseNavFlags } from '@/features/offline';
import { useShareSettingsStore } from '@/features/share';

/**
 * The user's visible sidebar entries in sidebar order, filtered the way the
 * sidebar filters them (random-nav mode, Lucky Mix, ND shares, offline browse).
 * `excludeRoutes` drops entries the caller already shows elsewhere.
 */
export function useMobileNavItems(excludeRoutes: ReadonlySet<string>): {
  items: NavItemMeta[];
  hasOfflineContent: boolean;
} {
  const sidebarItems = useSidebarStore(s => s.items);
  const randomNavMode = useAuthStore(s => s.randomNavMode);
  const offlineCtx = useReactiveOfflineBrowseContext();
  const offlineNav = offlineBrowseNavFlags(offlineCtx.capabilities);
  const isServerOffline = offlineCtx.active;
  const luckyMixBase = useLuckyMixAvailable();
  const luckyMixAvailable = luckyMixBase && randomNavMode === 'separate';
  const navidromeSharingEnabled = useShareSettingsStore(s => s.navidromeSharingEnabled);

  const items = sidebarItems
    .filter(cfg => {
      if (!cfg?.visible) return false;
      const item = ALL_NAV_ITEMS[cfg.id];
      if (!item) return false;
      if (excludeRoutes.has(item.to)) return false;
      if (randomNavMode === 'hub' && (cfg.id === 'randomMix' || cfg.id === 'randomAlbums')) return false;
      if (randomNavMode === 'separate' && cfg.id === 'randomPicker') return false;
      if (cfg.id === 'luckyMix' && !luckyMixAvailable) return false;
      if (cfg.id === 'shared' && !navidromeSharingEnabled) return false;
      if (cfg.id === 'shared') return true;
      if (isServerOffline && !isOfflineSidebarNavAllowed(
        cfg.id,
        offlineNav.favoritesOfflineBrowse,
        offlineNav.localLibraryBrowse,
        offlineNav.playerStatsBrowse,
        offlineNav.playlistsOfflineBrowse,
      )) {
        return false;
      }
      return true;
    })
    .map(cfg => ALL_NAV_ITEMS[cfg.id]);

  return { items, hasOfflineContent: offlineCtx.capabilities.manualPins };
}
