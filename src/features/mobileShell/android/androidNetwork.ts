/**
 * ⚠️ Android territory. Whether the connection is metered (mobile data, a hotspot), as
 * Android's ConnectivityManager reports it (`src-tauri/android/MainActivity.kt`). Feeds the
 * same store iOS feeds (`@/lib/network/meteredNetwork`), so downloads and the hot cache wait
 * for Wi-Fi on both phones alike.
 */
import { useMeteredNetworkStore } from '@/lib/network/meteredNetwork';
import { IS_ANDROID } from '@/lib/util/platform';

declare global {
  interface Window {
    __psyAndroidMetered?: (metered: boolean) => void;
  }
}

/** Follows Android's reports; returns the cleanup. */
export function watchAndroidMeteredNetwork(): () => void {
  if (!IS_ANDROID) return () => {};
  window.__psyAndroidMetered = metered => {
    useMeteredNetworkStore.setState({ metered: metered === true });
  };
  // The current state: reports only come on a change.
  const initial = window.PsysonicAndroidShell?.isMetered?.();
  if (typeof initial === 'boolean') useMeteredNetworkStore.setState({ metered: initial });
  return () => {
    delete window.__psyAndroidMetered;
  };
}
