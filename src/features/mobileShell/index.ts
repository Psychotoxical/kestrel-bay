// Touch shell for the iOS/Android app build (`IS_MOBILE_SHELL`): floating tab
// bar + mini player, Mainstage brand header, back bar, full-screen player,
// Library and Orbit tab roots. Desktop builds never render any of it.
export { default as MobileTabBar } from './components/MobileTabBar';
export { default as MobileMiniPlayer } from './components/MobileMiniPlayer';
export { default as MobileTopBar } from './components/MobileTopBar';
export { default as MobileRadioBridge } from './components/MobileRadioBridge';
export { default as MobileTouchContextMenu } from './components/MobileTouchContextMenu';
export { default as MobileSwipeNavigation } from './components/MobileSwipeNavigation';
export { default as MobilePlayer } from './components/MobilePlayer';
export { default as MobileBackButton } from './components/MobileBackButton';
export { default as MobileMoreMenu } from './components/MobileMoreMenu';
export { default as MobileSheet } from './components/MobileSheet';
export type { MobileMoreMenuAction, MobileMoreMenuItem, MobileMoreMenuShare } from './components/MobileMoreMenu';
export { useMobileBack } from './hooks/useMobileBack';
export { activeMobileTab, isMobileTabRoot, MOBILE_TAB_ROOTS } from './utils/mobileTabs';
