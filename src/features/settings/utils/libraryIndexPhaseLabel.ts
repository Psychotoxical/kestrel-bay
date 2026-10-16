import type { TFunction } from 'i18next';
import type { SyncStateDto } from '@/lib/api/library';
import {
  libraryStatusDisplayTrackCount,
  libraryStatusIsReady,
} from '@/lib/library/libraryReady';
import type { LibraryServerConnection } from '@/lib/library/hooks/useLibraryIndexSync';

/** Status line of a server's local library index (Settings → Servers). */
export function libraryIndexPhaseLabel(
  t: TFunction,
  status: SyncStateDto | null,
  connection: LibraryServerConnection,
  progressLabel: string | null,
): string {
  if (connection === 'offline') {
    return t('settings.libraryIndexServerOffline');
  }
  if (progressLabel) return progressLabel;
  if (!status) return t('settings.libraryIndexStatusIdle');
  if (libraryStatusIsReady(status)) {
    return t('settings.libraryIndexStatusReady', {
      count: libraryStatusDisplayTrackCount(status),
    });
  }
  switch (status.syncPhase) {
    case 'initial_sync':
      return t('settings.libraryIndexStatusInitial');
    case 'error':
      return t('settings.libraryIndexStatusError');
    case 'probing':
      return t('settings.libraryIndexStatusProbing');
    default:
      return t('settings.libraryIndexStatusIdle');
  }
}
