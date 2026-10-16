import type { ReactNode } from 'react';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

/**
 * Settings that do nothing in the touch shell (window, tray, mouse, desktop-only
 * UI such as the player bar or the fullscreen overlay). The search-index
 * generator knows this tag: whatever it wraps is left out of the settings search
 * in the touch shell as well.
 */
export default function DesktopOnly({ children }: { children: ReactNode }) {
  return IS_MOBILE_SHELL ? null : <>{children}</>;
}
