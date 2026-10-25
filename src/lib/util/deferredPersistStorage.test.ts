import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PersistStorage, StorageValue } from 'zustand/middleware';
import { createDeferredPersistStorage } from '@/lib/util/deferredPersistStorage';

type State = { n: number };

function memoryBase() {
  const data = new Map<string, StorageValue<State>>();
  const base: PersistStorage<State> = {
    getItem: name => data.get(name) ?? null,
    setItem: vi.fn((name: string, value: StorageValue<State>) => { data.set(name, value); }),
    removeItem: vi.fn((name: string) => { data.delete(name); }),
  };
  return { base, data };
}

describe('createDeferredPersistStorage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the latest value once per delay', () => {
    vi.useFakeTimers();
    const { base, data } = memoryBase();
    const storage = createDeferredPersistStorage(base, 1000)!;

    storage.setItem('k', { state: { n: 1 }, version: 0 });
    storage.setItem('k', { state: { n: 2 }, version: 0 });
    expect(base.setItem).not.toHaveBeenCalled();
    expect(storage.getItem('k')).toEqual({ state: { n: 2 }, version: 0 });

    vi.advanceTimersByTime(1000);
    expect(base.setItem).toHaveBeenCalledTimes(1);
    expect(data.get('k')).toEqual({ state: { n: 2 }, version: 0 });
  });

  it('flushes pending writes when the page is hidden', () => {
    vi.useFakeTimers();
    const { base, data } = memoryBase();
    const storage = createDeferredPersistStorage(base, 60_000)!;
    storage.setItem('k', { state: { n: 3 }, version: 0 });

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });

    expect(data.get('k')).toEqual({ state: { n: 3 }, version: 0 });
  });

  it('defers removals like writes', () => {
    vi.useFakeTimers();
    const { base, data } = memoryBase();
    data.set('k', { state: { n: 1 }, version: 0 });
    const storage = createDeferredPersistStorage(base, 1000)!;

    storage.removeItem('k');
    expect(storage.getItem('k')).toBeNull();
    expect(data.has('k')).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(data.has('k')).toBe(false);
  });
});
