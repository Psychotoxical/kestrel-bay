import { create, type StateCreator } from 'zustand';
import { persist } from 'zustand/middleware';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

/**
 * Full offline (no server probes, no Subsonic, local playback only). On the
 * desktop a DEV-only simulation; the touch shell exposes it to the user as
 * "downloaded music only" and keeps the choice across launches.
 */
interface DevOfflineBrowseState {
  forceOffline: boolean;
  setForceOffline: (v: boolean) => void;
  toggleForceOffline: () => void;
}

const devOfflineBrowseState: StateCreator<DevOfflineBrowseState> = (set, get) => ({
  forceOffline: false,
  setForceOffline: (v) => set({ forceOffline: v }),
  toggleForceOffline: () => set({ forceOffline: !get().forceOffline }),
});

export const useDevOfflineBrowseStore = IS_MOBILE_SHELL
  ? create<DevOfflineBrowseState>()(persist(devOfflineBrowseState, { name: 'psysonic-offline-only' }))
  : create<DevOfflineBrowseState>()(devOfflineBrowseState);

/** Builds where the switch may take effect: DEV everywhere, the touch shell always. */
export const FORCE_OFFLINE_AVAILABLE: boolean = import.meta.env.DEV || IS_MOBILE_SHELL;

/** True when the switch forces disconnected server + offline player behavior. */
export function isDevOfflineBrowseForced(): boolean {
  return FORCE_OFFLINE_AVAILABLE && useDevOfflineBrowseStore.getState().forceOffline;
}
