import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMeteredNetworkStore } from '@/lib/network/meteredNetwork';
import { useMeteredAllowanceStore } from '@/features/offline';
import { useMobileActionSheetStore } from '@/features/mobileShell/store/mobileActionSheetStore';
import { resolveHeldDownload, startTouchDownload } from '@/features/mobileShell/utils/meteredDownload';

const KEY = 'srv:al-1';

/** Answers the open sheet once it is open. */
async function answer(id: string | null) {
  await vi.waitFor(() => expect(useMobileActionSheetStore.getState().isOpen).toBe(true));
  useMobileActionSheetStore.getState().choose(id);
}

describe('downloads on mobile data', () => {
  afterEach(() => {
    useMeteredNetworkStore.setState({ metered: false });
    useMeteredAllowanceStore.setState({ keys: new Set() });
    useMobileActionSheetStore.setState({ isOpen: false });
  });

  it('starts right away off mobile data, without asking', async () => {
    const start = vi.fn();
    await startTouchDownload(KEY, start);
    expect(start).toHaveBeenCalledTimes(1);
    expect(useMobileActionSheetStore.getState().isOpen).toBe(false);
  });

  it('asks on mobile data; "load now" allows this download and starts it', async () => {
    useMeteredNetworkStore.setState({ metered: true });
    const start = vi.fn();
    const done = startTouchDownload(KEY, start);
    await answer('cellular');
    await done;
    expect(start).toHaveBeenCalledTimes(1);
    expect(useMeteredAllowanceStore.getState().keys.has(KEY)).toBe(true);
  });

  it('"wait for Wi-Fi" queues the download without allowing it', async () => {
    useMeteredNetworkStore.setState({ metered: true });
    useMeteredAllowanceStore.setState({ keys: new Set([KEY]) });
    const start = vi.fn();
    const done = startTouchDownload(KEY, start);
    await answer('wait');
    await done;
    expect(start).toHaveBeenCalledTimes(1);
    expect(useMeteredAllowanceStore.getState().keys.has(KEY)).toBe(false);
  });

  it('closing the question starts nothing', async () => {
    useMeteredNetworkStore.setState({ metered: true });
    const start = vi.fn();
    const done = startTouchDownload(KEY, start);
    await answer(null);
    await done;
    expect(start).not.toHaveBeenCalled();
  });

  it('a waiting download can load now or be cancelled', async () => {
    const cancel = vi.fn();
    let done = resolveHeldDownload(KEY, cancel);
    await answer('cellular');
    await done;
    expect(useMeteredAllowanceStore.getState().keys.has(KEY)).toBe(true);
    expect(cancel).not.toHaveBeenCalled();

    done = resolveHeldDownload(KEY, cancel);
    await answer('stop');
    await done;
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('offers no cancel when the caller has none', async () => {
    const done = resolveHeldDownload(KEY);
    await vi.waitFor(() => expect(useMobileActionSheetStore.getState().isOpen).toBe(true));
    expect(useMobileActionSheetStore.getState().actions.map(a => a.id)).toEqual(['cellular']);
    useMobileActionSheetStore.getState().choose(null);
    await done;
  });
});
