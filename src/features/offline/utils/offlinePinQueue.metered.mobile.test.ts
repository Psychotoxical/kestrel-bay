import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cancelledDownloads, useOfflineJobStore } from '@/features/offline/store/offlineJobStore';
import {
  clearOfflinePinTasks,
  enqueueOfflinePin,
  registerOfflinePinExecutor,
  type OfflinePinTask,
} from '@/features/offline/utils/offlinePinQueue';
import {
  allowMeteredDownload,
  meteredPinKey,
  useMeteredAllowanceStore,
  waitForDownloadNetwork,
} from '@/features/offline/utils/meteredDownloadGate';
import { useMeteredNetworkStore } from '@/lib/network/meteredNetwork';

function task(albumId: string): OfflinePinTask {
  return {
    albumId, albumName: albumId, albumArtist: 'A', coverArt: undefined, year: undefined,
    songs: [], serverId: 'srv', type: 'album',
  };
}

const settle = () => new Promise<void>(resolve => { setTimeout(resolve, 0); });

describe('pin queue on mobile data (touch shell)', () => {
  const started: string[] = [];

  beforeEach(() => {
    started.length = 0;
    cancelledDownloads.clear();
    clearOfflinePinTasks();
    useOfflineJobStore.setState({ jobs: [], pinQueue: [], bulkProgress: {} });
    useMeteredNetworkStore.setState({ metered: false });
    useMeteredAllowanceStore.setState({ keys: new Set() });
  });

  afterEach(() => {
    useMeteredNetworkStore.setState({ metered: false });
  });

  it('keeps a download queued on mobile data and starts it on Wi-Fi', async () => {
    registerOfflinePinExecutor(async (t, markStarted) => {
      started.push(t.albumId);
      markStarted();
    });
    useMeteredNetworkStore.setState({ metered: true });

    enqueueOfflinePin(task('al-1'));
    await settle();
    expect(started).toEqual([]);
    expect(useOfflineJobStore.getState().pinQueue.map(p => p.status)).toEqual(['queued']);

    useMeteredNetworkStore.setState({ metered: false });
    await settle();
    expect(started).toEqual(['al-1']);
  });

  it('starts a download allowed on mobile data right away', async () => {
    registerOfflinePinExecutor(async (t, markStarted) => {
      started.push(t.albumId);
      markStarted();
    });
    useMeteredNetworkStore.setState({ metered: true });
    allowMeteredDownload(meteredPinKey('al-1', 'srv'));

    enqueueOfflinePin(task('al-1'));
    await settle();
    expect(started).toEqual(['al-1']);
  });

  it('gives the slots of downloads that wait for Wi-Fi to an allowed one', async () => {
    const trackDone: Array<() => void> = [];
    registerOfflinePinExecutor(async (t, markStarted) => {
      started.push(t.albumId);
      markStarted();
      // One track, then the gate before the next, as the real executor runs.
      await new Promise<void>(resolve => trackDone.push(resolve));
      await waitForDownloadNetwork(t, () => false);
    });

    // Two downloads start on Wi-Fi and fill both slots; a third, allowed on
    // mobile data, queues behind them.
    enqueueOfflinePin(task('al-1'));
    enqueueOfflinePin(task('al-2'));
    allowMeteredDownload(meteredPinKey('al-3', 'srv'));
    enqueueOfflinePin(task('al-3'));
    await settle();
    expect(started).toEqual(['al-1', 'al-2']);

    // The phone leaves Wi-Fi: after their current track the first two wait and
    // hand their slots to the allowed one.
    useMeteredNetworkStore.setState({ metered: true });
    trackDone.splice(0).forEach(resolve => resolve());
    await settle();
    expect(started).toEqual(['al-1', 'al-2', 'al-3']);

    useMeteredNetworkStore.setState({ metered: false });
    trackDone.splice(0).forEach(resolve => resolve());
    await settle();
  });
});
