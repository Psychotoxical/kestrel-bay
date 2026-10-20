import { create } from 'zustand';
import { emit, listen } from '@tauri-apps/api/event';

interface MeteredNetworkState {
  /** Cellular data or a Personal Hotspot. */
  metered: boolean;
}

/**
 * Touch shell: whether the connection is metered, as the app shell reports it (iOS:
 * `src-tauri/src/ios/network.rs`; Android: `mobileShell/android/androidNetwork.ts`). Stays
 * `false` where nothing reports it (desktop), so nothing there waits for Wi-Fi.
 */
export const useMeteredNetworkStore = create<MeteredNetworkState>()(() => ({ metered: false }));

export function isMeteredNetwork(): boolean {
  return useMeteredNetworkStore.getState().metered;
}

/** Follows the native reports; returns the unsubscribe. */
export async function watchMeteredNetwork(): Promise<() => void> {
  const off = await listen<boolean>('ios-network:metered', event => {
    useMeteredNetworkStore.setState({ metered: event.payload === true });
  });
  // The first report may have gone out before this listener existed.
  await emit('ios-network:query').catch(() => {});
  return off;
}
