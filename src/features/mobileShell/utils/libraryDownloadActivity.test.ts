import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOfflineJobStore, useOfflineLibraryPinStore } from '@/features/offline';
import type { OfflinePinQueueEntry } from '@/features/offline';

const calls: [boolean, string][] = [];

import { watchLibraryDownloadActivity } from '@/features/mobileShell/utils/libraryDownloadActivity';

const keepAwakeForLibraryDownloads = () => watchLibraryDownloadActivity((active, names) => {
  calls.push([active, names]);
});

function queued(albumId: string, pinKind: OfflinePinQueueEntry['pinKind']): OfflinePinQueueEntry {
  return { albumId, albumName: albumId, pinKind, status: 'queued', queuedAt: 0, serverId: 'srv' };
}

describe('whole-library download activity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    calls.length = 0;
    useOfflineJobStore.setState({ jobs: [], pinQueue: [], bulkProgress: {} });
    useOfflineLibraryPinStore.setState({
      libraries: {
        'srv:lib': { serverId: 'srv', libraryId: 'lib', name: 'Sampler', pinnedAt: 0, trackCount: 1, totalBytes: 1 },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with library albums in the queue and stops only after a quiet gap', () => {
    const stop = keepAwakeForLibraryDownloads();
    expect(calls).toEqual([]);

    useOfflineJobStore.setState({ pinQueue: [queued('a1', 'library')] });
    expect(calls).toEqual([[true, 'Sampler']]);

    // Between two albums the queue is empty for a moment.
    useOfflineJobStore.setState({ pinQueue: [] });
    vi.advanceTimersByTime(5_000);
    useOfflineJobStore.setState({ pinQueue: [queued('a2', 'library')] });
    vi.advanceTimersByTime(20_000);
    expect(calls).toEqual([[true, 'Sampler']]);

    useOfflineJobStore.setState({ pinQueue: [] });
    vi.advanceTimersByTime(15_000);
    expect(calls).toEqual([[true, 'Sampler'], [false, 'Sampler']]);
    stop();
  });

  it('ignores downloads of single albums and playlists', () => {
    const stop = keepAwakeForLibraryDownloads();
    useOfflineJobStore.setState({ pinQueue: [queued('a1', 'album'), queued('p1', 'playlist')] });
    expect(calls).toEqual([]);
    stop();
  });
});
