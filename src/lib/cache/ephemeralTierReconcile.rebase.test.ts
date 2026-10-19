/** The cache check waits for the iOS path rebase and checks the rebased paths, not its snapshot. */
import { describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => vi.fn(async ({ localPaths }: { localPaths: string[] }) => localPaths.map(p => p.startsWith('/new/'))));
vi.mock('@/lib/api/syncfs', async importOriginal => ({
  ...(await importOriginal<object>()),
  probeMediaFiles: probe,
  pruneEmptyMediaTierDirs: vi.fn(async () => {}),
}));

import { reconcileEphemeralCache } from './ephemeralTierReconcile';
import { setLocalPathRebase } from './localPathRebase';

describe('reconcileEphemeralCache after an app update', () => {
  it('keeps entries whose files moved with the container', async () => {
    let entries = { 'srv:t1': { tier: 'ephemeral', localPath: '/old/media/cache/a.mp3' } };
    const snapshot = entries;
    setLocalPathRebase(Promise.resolve().then(() => {
      entries = { 'srv:t1': { tier: 'ephemeral', localPath: '/new/media/cache/a.mp3' } };
    }));
    const removeEntry = vi.fn();
    const result = await reconcileEphemeralCache({ entries: snapshot, getEntries: () => entries, removeEntry });
    expect(probe).toHaveBeenCalledWith({ localPaths: ['/new/media/cache/a.mp3'] });
    expect(removeEntry).not.toHaveBeenCalled();
    expect(result.removedStaleIndex).toBe(0);
  });
});
