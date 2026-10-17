import { afterEach, describe, expect, it } from 'vitest';
import { useMeteredNetworkStore } from '@/lib/network/meteredNetwork';
import { useOfflineJobStore } from '@/features/offline/store/offlineJobStore';
import {
  allowMeteredDownload,
  disallowMeteredDownload,
  isPinHeldForWifi,
  meteredGroupKey,
  meteredPinKey,
  useMeteredAllowanceStore,
  waitForDownloadNetwork,
  waitingForWifiPinCount,
} from '@/features/offline/utils/meteredDownloadGate';

const pin = { albumId: 'al-1', serverId: 'srv' };

/** Lets pending promise callbacks run. */
const settle = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });

describe('metered download gate', () => {
  afterEach(() => {
    useMeteredNetworkStore.setState({ metered: false });
    useMeteredAllowanceStore.setState({ keys: new Set() });
  });

  it('holds a pin only on mobile data and only without an allowance', () => {
    expect(isPinHeldForWifi(pin)).toBe(false);
    useMeteredNetworkStore.setState({ metered: true });
    expect(isPinHeldForWifi(pin)).toBe(true);
    allowMeteredDownload(meteredPinKey('al-1', 'srv'));
    expect(isPinHeldForWifi(pin)).toBe(false);
    disallowMeteredDownload(meteredPinKey('al-1', 'srv'));
    expect(isPinHeldForWifi(pin)).toBe(true);
  });

  it('lets a whole discography through by its artist group', () => {
    useMeteredNetworkStore.setState({ metered: true });
    const artistPin = { ...pin, artistProgressGroupId: 'srv:ar-1' };
    allowMeteredDownload(meteredGroupKey('srv:ar-1'));
    expect(isPinHeldForWifi(artistPin)).toBe(false);
    expect(isPinHeldForWifi(pin)).toBe(true);
  });

  it('waits on mobile data until Wi-Fi is back, and counts the waiting pin meanwhile', async () => {
    useMeteredNetworkStore.setState({ metered: true });
    let passed = false;
    const waiting = waitForDownloadNetwork(pin, () => false).then(() => { passed = true; });
    await settle();
    expect(passed).toBe(false);
    expect(waitingForWifiPinCount()).toBe(1);

    useMeteredNetworkStore.setState({ metered: false });
    await waiting;
    expect(passed).toBe(true);
    expect(waitingForWifiPinCount()).toBe(0);
  });

  it('stops waiting once the user allows the download on mobile data', async () => {
    useMeteredNetworkStore.setState({ metered: true });
    const waiting = waitForDownloadNetwork(pin, () => false);
    await settle();
    allowMeteredDownload(meteredPinKey('al-1', 'srv'));
    await expect(waiting).resolves.toBeUndefined();
  });

  it('leaves the wait when the download is cancelled', async () => {
    useMeteredNetworkStore.setState({ metered: true });
    let cancelled = false;
    const waiting = waitForDownloadNetwork(pin, () => cancelled);
    await settle();
    cancelled = true;
    // Cancelling changes the job store, which wakes the wait.
    useOfflineJobStore.setState(state => ({ ...state }));
    await expect(waiting).resolves.toBeUndefined();
    expect(waitingForWifiPinCount()).toBe(0);
  });

  it('does not wait off mobile data', async () => {
    await expect(waitForDownloadNetwork(pin, () => false)).resolves.toBeUndefined();
    expect(waitingForWifiPinCount()).toBe(0);
  });
});
