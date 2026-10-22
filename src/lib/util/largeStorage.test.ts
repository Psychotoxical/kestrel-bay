import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  flushLargeStorage,
  largeAwareStorage,
  preloadLargeStorage,
  resetLargeStorageForTests,
  type LargeStorageBackend,
} from '@/lib/util/largeStorage';

const KEY = 'psysonic-local-playback';
const RECOVERY = 'psysonic-local-playback-collision-recovery-v1:music.test';

function memoryBackend(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: Map<string, string | null>[] = [];
  let failNext = false;
  const backend: LargeStorageBackend = {
    loadAll: async () => new Map(data),
    write: async batch => {
      if (failNext) {
        failNext = false;
        throw new Error('write failed');
      }
      writes.push(new Map(batch));
      for (const [key, value] of batch) {
        if (value === null) data.delete(key);
        else data.set(key, value);
      }
    },
  };
  return { backend, data, writes, failOnce: () => { failNext = true; } };
}

beforeEach(() => {
  localStorage.clear();
  resetLargeStorageForTests();
});

afterEach(() => {
  resetLargeStorageForTests();
});

describe('largeAwareStorage', () => {
  it('stays on localStorage without a backend', async () => {
    await preloadLargeStorage(async () => null);
    largeAwareStorage.setItem(KEY, 'v1');
    expect(localStorage.getItem(KEY)).toBe('v1');
    expect(largeAwareStorage.getItem(KEY)).toBe('v1');
  });

  it('moves the download index out of localStorage on first start', async () => {
    localStorage.setItem(KEY, 'from-local');
    localStorage.setItem(RECOVERY, 'recovery');
    localStorage.setItem('psysonic-auth', 'auth');
    const mem = memoryBackend();
    await preloadLargeStorage(async () => mem.backend);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(RECOVERY)).toBeNull();
    expect(localStorage.getItem('psysonic-auth')).toBe('auth');
    expect(mem.data.get(KEY)).toBe('from-local');
    expect(mem.data.get(RECOVERY)).toBe('recovery');
    expect(largeAwareStorage.getItem(KEY)).toBe('from-local');
  });

  it('keeps everything in localStorage when the move fails', async () => {
    localStorage.setItem(KEY, 'from-local');
    const mem = memoryBackend();
    mem.failOnce();
    await preloadLargeStorage(async () => mem.backend);
    expect(localStorage.getItem(KEY)).toBe('from-local');
    largeAwareStorage.setItem(KEY, 'next');
    expect(localStorage.getItem(KEY)).toBe('next');
  });

  it('prefers a localStorage copy over IndexedDB (written by an older build)', async () => {
    localStorage.setItem(KEY, 'newer-from-old-build');
    const mem = memoryBackend({ [KEY]: 'older' });
    await preloadLargeStorage(async () => mem.backend);
    expect(largeAwareStorage.getItem(KEY)).toBe('newer-from-old-build');
    expect(mem.data.get(KEY)).toBe('newer-from-old-build');
  });

  it('serves reads from memory and writes the latest value through', async () => {
    const mem = memoryBackend({ [KEY]: 'stored' });
    await preloadLargeStorage(async () => mem.backend);
    expect(largeAwareStorage.getItem(KEY)).toBe('stored');
    largeAwareStorage.setItem(KEY, 'a');
    largeAwareStorage.setItem(KEY, 'b');
    expect(largeAwareStorage.getItem(KEY)).toBe('b');
    await flushLargeStorage();
    expect(mem.data.get(KEY)).toBe('b');
    expect(localStorage.getItem(KEY)).toBeNull();
    largeAwareStorage.removeItem(KEY);
    await flushLargeStorage();
    expect(mem.data.has(KEY)).toBe(false);
  });

  it('holds more than the localStorage quota', async () => {
    const mem = memoryBackend();
    await preloadLargeStorage(async () => mem.backend);
    const big = 'x'.repeat(6_000_000);
    largeAwareStorage.setItem(KEY, big);
    await flushLargeStorage();
    expect(largeAwareStorage.getItem(KEY)?.length).toBe(6_000_000);
    expect(mem.data.get(KEY)?.length).toBe(6_000_000);
  });

  it('lists large keys next to the localStorage keys', async () => {
    localStorage.setItem('psysonic-auth', 'auth');
    const mem = memoryBackend({ [KEY]: 'v', [RECOVERY]: 'r' });
    await preloadLargeStorage(async () => mem.backend);
    const keys = Array.from({ length: largeAwareStorage.length }, (_, i) => largeAwareStorage.key(i));
    expect(keys.sort()).toEqual(['psysonic-auth', KEY, RECOVERY].sort());
  });

  it('keeps small keys in localStorage', async () => {
    const mem = memoryBackend();
    await preloadLargeStorage(async () => mem.backend);
    largeAwareStorage.setItem('psysonic-local-playback-migrated-v1', '1');
    expect(localStorage.getItem('psysonic-local-playback-migrated-v1')).toBe('1');
    expect(mem.data.size).toBe(0);
  });
});
