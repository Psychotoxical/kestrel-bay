/**
 * IndexedDB home for persisted slices that outgrow `localStorage`. Only the
 * mobile shell runs `preloadLargeStorage()`; on the desktop nothing moves.
 *
 * A WebView gives one origin about 5 M characters of `localStorage`. The
 * download index (`psysonic-local-playback`) needs ~650 characters per track,
 * so at roughly 7900 downloaded tracks every write failed and new downloads
 * were forgotten on the next start. The offline source list
 * (`psysonic-offline`, ~2 KB per downloaded album) moves along, since a
 * whole downloaded library would outgrow the quota the same way.
 *
 * Callers stay synchronous: `preloadLargeStorage()` runs once before any store
 * or migration touches storage and loads the large keys into memory. After
 * that, `largeAwareStorage` answers reads from memory and writes through to
 * IndexedDB in the background (latest value per key wins). Every other key
 * still goes straight to `localStorage`. Without IndexedDB (tests, a failed
 * open) everything stays in `localStorage`, exactly as before.
 */

const LARGE_KEYS = new Set(['psysonic-local-playback', 'psysonic-offline']);
const LARGE_KEY_PREFIX = 'psysonic-local-playback-collision-recovery-v1:';

export function isLargeStorageKey(key: string): boolean {
  return LARGE_KEYS.has(key) || key.startsWith(LARGE_KEY_PREFIX);
}

/** Where the large keys live; IndexedDB in the app, injectable for tests. */
export interface LargeStorageBackend {
  loadAll(): Promise<Map<string, string>>;
  /** `null` deletes the key. Resolves once the batch is durable. */
  write(batch: Map<string, string | null>): Promise<void>;
}

const DB_NAME = 'psysonic-large-storage';
const STORE_NAME = 'kv';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
  });
}

async function openIndexedDbBackend(): Promise<LargeStorageBackend | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(`Could not open ${DB_NAME}`));
    request.onblocked = () => reject(new Error(`Could not open blocked ${DB_NAME}`));
  });
  return {
    async loadAll() {
      const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
      const [keys, values] = await Promise.all([
        requestResult(store.getAllKeys()),
        requestResult(store.getAll()),
      ]);
      const out = new Map<string, string>();
      keys.forEach((key, index) => {
        const value = values[index];
        if (typeof key === 'string' && typeof value === 'string') out.set(key, value);
      });
      return out;
    },
    async write(batch) {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      for (const [key, value] of batch) {
        if (value === null) store.delete(key);
        else store.put(value, key);
      }
      await transactionDone(transaction);
    },
  };
}

let backend: LargeStorageBackend | null = null;
const cache = new Map<string, string>();
const pending = new Map<string, string | null>();
let draining: Promise<void> | null = null;
let preloading: Promise<void> | null = null;
let writeFailureWarned = false;

function drain(): Promise<void> {
  if (draining) return draining;
  draining = (async () => {
    while (pending.size > 0 && backend) {
      const batch = new Map(pending);
      pending.clear();
      try {
        await backend.write(batch);
        writeFailureWarned = false;
      } catch (e) {
        if (!writeFailureWarned) {
          writeFailureWarned = true;
          console.warn('[psysonic] large storage write failed', e);
        }
      }
    }
  })().finally(() => {
    draining = null;
  });
  return draining;
}

function schedule(key: string, value: string | null): void {
  pending.set(key, value);
  void drain();
}

/**
 * Load the large keys into memory and move any copy still in `localStorage`
 * over. Run once before stores or migrations read storage; repeated calls
 * share the first run. A copy in `localStorage` wins over IndexedDB: it means
 * an older build wrote it after the last move.
 */
export function preloadLargeStorage(
  open: () => Promise<LargeStorageBackend | null> = openIndexedDbBackend,
): Promise<void> {
  if (preloading) return preloading;
  preloading = (async () => {
    let opened: LargeStorageBackend | null;
    let loaded = new Map<string, string>();
    try {
      opened = await open();
      if (opened) loaded = await opened.loadAll();
    } catch (e) {
      console.warn('[psysonic] large storage unavailable, staying on localStorage', e);
      return;
    }
    if (!opened) return;

    const moved = new Map<string, string>();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !isLargeStorageKey(key)) continue;
      const value = localStorage.getItem(key);
      if (value !== null) moved.set(key, value);
    }
    if (moved.size > 0) {
      try {
        await opened.write(new Map(moved));
      } catch (e) {
        // Keep everything in localStorage; the next start tries again.
        console.warn('[psysonic] could not move large keys to IndexedDB', e);
        return;
      }
      for (const [key, value] of moved) {
        loaded.set(key, value);
        localStorage.removeItem(key);
      }
    }
    for (const [key, value] of loaded) cache.set(key, value);
    backend = opened;
  })();
  return preloading;
}

/** Resolves once every write so far is durable in IndexedDB. */
export function flushLargeStorage(): Promise<void> {
  return draining ?? Promise.resolve();
}

function localKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null) keys.push(key);
  }
  return keys;
}

/**
 * `Storage` that keeps the large keys in IndexedDB once
 * {@link preloadLargeStorage} has run, and uses `localStorage` for the rest.
 */
export const largeAwareStorage: Storage = {
  get length() {
    return localStorage.length + (backend ? cache.size : 0);
  },
  key(index: number): string | null {
    const local = localKeys();
    if (index < local.length) return local[index];
    if (!backend) return null;
    return [...cache.keys()][index - local.length] ?? null;
  },
  getItem(key: string): string | null {
    if (backend && isLargeStorageKey(key)) return cache.get(key) ?? null;
    return localStorage.getItem(key);
  },
  setItem(key: string, value: string): void {
    if (backend && isLargeStorageKey(key)) {
      cache.set(key, value);
      schedule(key, value);
      return;
    }
    localStorage.setItem(key, value);
  },
  removeItem(key: string): void {
    if (backend && isLargeStorageKey(key)) {
      cache.delete(key);
      schedule(key, null);
      return;
    }
    localStorage.removeItem(key);
  },
  clear(): void {
    localStorage.clear();
    if (!backend) return;
    for (const key of cache.keys()) schedule(key, null);
    cache.clear();
  },
};

/** Test-only reset. */
export function resetLargeStorageForTests(): void {
  backend = null;
  cache.clear();
  pending.clear();
  draining = null;
  preloading = null;
  writeFailureWarned = false;
}
