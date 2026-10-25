import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * Persist storage that writes at most once per `delayMs`.
 *
 * zustand serialises the whole persisted slice on every `set()`. For the
 * download index that cost ~0.4 s per change at 50,000 tracks on a Galaxy S22,
 * paid once per finished track while a whole library downloads. Writes here
 * collect and go out together; the base storage (and its JSON step) only runs
 * on the flush. Pending writes also flush when the page is hidden, so sending
 * the app to the background keeps them.
 */
export function createDeferredPersistStorage<S>(
  base: PersistStorage<S> | undefined,
  delayMs = 2000,
): PersistStorage<S> | undefined {
  if (!base) return undefined;
  const pending = new Map<string, StorageValue<S> | null>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const batch = [...pending];
    pending.clear();
    for (const [name, value] of batch) {
      if (value === null) void base.removeItem(name);
      else void base.setItem(name, value);
    }
  };
  const schedule = () => {
    timer ??= setTimeout(flush, delayMs);
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }
  if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);

  return {
    getItem: name => (pending.has(name) ? pending.get(name) ?? null : base.getItem(name)),
    setItem: (name, value) => {
      pending.set(name, value);
      schedule();
    },
    removeItem: name => {
      pending.set(name, null);
      schedule();
    },
  };
}
