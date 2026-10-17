import { create } from 'zustand';
import { activeMobileTab, isMobileTabRoot, type MobileTabId } from '@/features/mobileShell/utils/mobileTabs';

interface MobileTabEntry {
  tab: MobileTabId;
  /** The entry's path: a reused key (the start entry's "default") on another path is a new entry. */
  pathname: string;
}

interface MobileTabState {
  /** The tab each history entry was opened in, by router location key. */
  byEntry: Record<string, MobileTabEntry>;
  /** The tab of the entry shown last. */
  current: MobileTabId | null;
  /** Notes the tab of a location: kept for a known entry, the current tab for a new one. */
  record: (entryKey: string, pathname: string) => void;
}

/** The recorded tab of an entry, if it was recorded on this path. */
export function recordedMobileTab(
  byEntry: Record<string, MobileTabEntry>,
  entryKey: string,
  pathname: string,
): MobileTabId | undefined {
  const entry = byEntry[entryKey];
  return entry?.pathname === pathname ? entry.tab : undefined;
}

/**
 * Which tab a page belongs to, as on iOS: a page stays in the tab it was opened
 * from (an album opened on the Mainstage is the Mainstage's), only a tab root
 * starts its own tab. Going back returns each entry to the tab it had.
 */
export const useMobileTabStore = create<MobileTabState>()((set, get) => ({
  byEntry: {},
  current: null,
  record: (entryKey, pathname) => {
    const natural = activeMobileTab(pathname);
    if (natural === null) return;
    const { byEntry, current } = get();
    const known = recordedMobileTab(byEntry, entryKey, pathname);
    if (known) {
      if (known !== current) set({ current: known });
      return;
    }
    const tab = isMobileTabRoot(pathname) || current === null ? natural : current;
    set({ byEntry: { ...byEntry, [entryKey]: { tab, pathname } }, current: tab });
  },
}));
