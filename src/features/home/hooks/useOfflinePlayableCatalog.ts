import { useEffect, useState } from 'react';
import { useLocalPlaybackStore } from '@/store/localPlaybackStore';
import {
  loadOfflinePlayableCatalog,
  type OfflinePlayableCatalog,
} from '@/features/home/utils/offlinePlayableCatalog';

/**
 * What can play from this device for these servers; null until the first load
 * resolves. Reloads when downloads or cached tracks change.
 */
export function useOfflinePlayableCatalog(serverIds: readonly string[]): OfflinePlayableCatalog | null {
  const entries = useLocalPlaybackStore(s => s.entries);
  const key = serverIds.join('\0');
  const [loaded, setLoaded] = useState<{ key: string; catalog: OfflinePlayableCatalog } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOfflinePlayableCatalog(key ? key.split('\0') : [])
      .catch(() => loadOfflinePlayableCatalog([]))
      .then(catalog => {
        if (!cancelled) setLoaded({ key, catalog });
      });
    return () => {
      cancelled = true;
    };
  }, [key, entries]);

  return loaded?.key === key ? loaded.catalog : null;
}
