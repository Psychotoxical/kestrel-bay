// Touch shell for the iOS/Android app build (`IS_MOBILE_SHELL`): the building
// blocks other features use in their touch variants (sheet, "…" menu, back
// button, transition chips). The shell itself (tab bar, player bar, full-screen
// player, bridges) is mounted by the app shell through `./shell`.
// Desktop builds never render any of it.
export { default as MobileBackButton } from './components/MobileBackButton';
export { default as MobileMoreMenu } from './components/MobileMoreMenu';
export { default as MobileSheet } from './components/MobileSheet';
export { default as TransitionModeChips } from './components/TransitionModeChips';
export { default as CrossfadeLengthSlider } from './components/CrossfadeLengthSlider';
export type { MobileMoreMenuAction, MobileMoreMenuItem, MobileMoreMenuShare } from './components/MobileMoreMenu';
export { useMobileBack } from './hooks/useMobileBack';
export { activeMobileTab, isMobileTabRoot, MOBILE_TAB_ROOTS } from './utils/mobileTabs';
