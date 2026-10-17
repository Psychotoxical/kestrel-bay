import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router';
import { activeMobileTab, type MobileTabId } from '@/features/mobileShell/utils/mobileTabs';
import { recordedMobileTab, useMobileTabStore } from '@/features/mobileShell/store/mobileTabStore';

/**
 * The tab the shown page belongs to: the one it was opened from (see
 * `useMobileTabStore`); `null` for pages outside the tabs (settings, help, …).
 */
export function useMobileActiveTab(): MobileTabId | null {
  const { key, pathname } = useLocation();
  const recorded = useMobileTabStore(s => recordedMobileTab(s.byEntry, key, pathname));
  const natural = activeMobileTab(pathname);
  if (natural === null) return null;
  // Before the entry is recorded (the first render after a navigation) the route decides.
  return recorded ?? natural;
}

/** Records each shown entry's tab; mounted once, in the tab bar. */
export function useRecordMobileTab(): void {
  const { key, pathname } = useLocation();
  useLayoutEffect(() => {
    useMobileTabStore.getState().record(key, pathname);
  }, [key, pathname]);
}
