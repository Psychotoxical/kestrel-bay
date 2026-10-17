import { create } from 'zustand';
import { isMeteredNetwork, useMeteredNetworkStore } from '@/lib/network/meteredNetwork';
import { useOfflineJobStore } from '@/features/offline/store/offlineJobStore';

/**
 * Touch shell: downloads on a metered connection (cellular, hotspot) run only
 * when the user allowed it for them; every other download waits for Wi-Fi.
 *
 * The user allows an album or playlist by its pin (`serverId:albumId`, as the
 * pin queue keys it) and a whole discography by its artist progress group. An
 * allowance lasts for the app session; choosing "wait" takes it back.
 */
interface MeteredAllowanceState {
  keys: ReadonlySet<string>;
}

export const useMeteredAllowanceStore = create<MeteredAllowanceState>()(() => ({ keys: new Set<string>() }));

export function meteredPinKey(albumId: string, serverId: string): string {
  return `${serverId}:${albumId}`;
}

export function meteredGroupKey(artistProgressGroupId: string): string {
  return `group:${artistProgressGroupId}`;
}

export function allowMeteredDownload(key: string): void {
  useMeteredAllowanceStore.setState(state => ({ keys: new Set(state.keys).add(key) }));
}

export function disallowMeteredDownload(key: string): void {
  useMeteredAllowanceStore.setState(state => {
    const keys = new Set(state.keys);
    keys.delete(key);
    return { keys };
  });
}

interface GatedPin {
  albumId: string;
  serverId: string;
  artistProgressGroupId?: string;
}

function isAllowed(pin: GatedPin, keys: ReadonlySet<string>): boolean {
  return keys.has(meteredPinKey(pin.albumId, pin.serverId))
    || (!!pin.artistProgressGroupId && keys.has(meteredGroupKey(pin.artistProgressGroupId)));
}

/** True when this pin must not transfer right now. */
export function isPinHeldForWifi(pin: GatedPin): boolean {
  return isMeteredNetwork() && !isAllowed(pin, useMeteredAllowanceStore.getState().keys);
}

let waiters: Array<() => void> = [];
let subscribed = false;
let redispatch: (() => void) | null = null;
/** Pins whose running download waits for Wi-Fi, with the number of workers waiting. */
const waitingPins = new Map<string, number>();

function wakeWaiters(): void {
  const woken = waiters;
  waiters = [];
  for (const wake of woken) wake();
}

function onGateChange(): void {
  wakeWaiters();
  redispatch?.();
}

// Re-check on anything that can end a wait: the network or an allowance (both
// also let held, unstarted pins start), or the queue (a cancelled download has
// to leave its wait to finish). Only the touch shell gets here.
function subscribeOnce(): void {
  if (subscribed) return;
  subscribed = true;
  useMeteredNetworkStore.subscribe(onGateChange);
  useMeteredAllowanceStore.subscribe(onGateChange);
  useOfflineJobStore.subscribe(wakeWaiters);
}

/** Touch shell: the pin queue dispatches again through this when a held download may start. */
export function registerMeteredRedispatch(dispatch: () => void): void {
  redispatch = dispatch;
  subscribeOnce();
}

/** Running downloads that wait for Wi-Fi; their queue slots are free for allowed ones meanwhile. */
export function waitingForWifiPinCount(): number {
  return waitingPins.size;
}

/**
 * Resolves once the pin may transfer, or once it was cancelled. Called between
 * tracks, so a running download finishes its current track and then waits.
 */
export async function waitForDownloadNetwork(pin: GatedPin, isCancelled: () => boolean): Promise<void> {
  if (!isPinHeldForWifi(pin) || isCancelled()) return;
  const key = meteredPinKey(pin.albumId, pin.serverId);
  waitingPins.set(key, (waitingPins.get(key) ?? 0) + 1);
  subscribeOnce();
  redispatch?.();
  try {
    while (isPinHeldForWifi(pin) && !isCancelled()) {
      await new Promise<void>(resolve => { waiters.push(resolve); });
    }
  } finally {
    const left = (waitingPins.get(key) ?? 1) - 1;
    if (left > 0) waitingPins.set(key, left);
    else waitingPins.delete(key);
  }
}

/** Reactive: whether the album / playlist / discography download with this key waits for Wi-Fi. */
export function useDownloadKeyHeldForWifi(key: string, active: boolean): boolean {
  const metered = useMeteredNetworkStore(s => s.metered);
  const allowed = useMeteredAllowanceStore(s => s.keys.has(key));
  return active && metered && !allowed;
}
