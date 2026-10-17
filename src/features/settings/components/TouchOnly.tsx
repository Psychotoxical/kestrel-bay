import type { ReactNode } from 'react';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

/**
 * Settings that exist only in the touch shell (e.g. the phone's downloads).
 * The counterpart of `DesktopOnly`: the search-index generator knows this tag
 * too, and the desktop search leaves out whatever it wraps.
 */
export default function TouchOnly({ children }: { children: ReactNode }) {
  return IS_MOBILE_SHELL ? <>{children}</> : null;
}
