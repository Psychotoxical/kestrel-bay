import { useOfflineJobStore, useOfflineLibraryPinStore } from '@/features/offline';

/** The queue empties for a moment between two albums; only a longer gap ends the work. */
const STOP_AFTER_IDLE_MS = 15_000;

function libraryDownloadActive(): boolean {
  return useOfflineJobStore.getState().pinQueue.some(entry => entry.pinKind === 'library');
}

function downloadingLibraryNames(): string {
  return Object.values(useOfflineLibraryPinStore.getState().libraries)
    .filter(pin => !pin.pausedForSpace)
    .map(pin => pin.name)
    .join(', ');
}

/**
 * Reports whether a whole-library download is running: albums of a library pin in the
 * download queue. Called with `true` (and the libraries' names) when it starts or the names
 * change, and with `false` once the queue held none for {@link STOP_AFTER_IDLE_MS}. The
 * native sides keep the app running for it (Android) or the screen on (iOS). Returns the
 * cleanup, which reports `false` if the work was still running.
 */
export function watchLibraryDownloadActivity(
  onChange: (active: boolean, libraryNames: string) => void,
): () => void {
  let active = false;
  let names = '';
  let stopTimer: ReturnType<typeof setTimeout> | null = null;

  const update = () => {
    const nextNames = downloadingLibraryNames();
    if (libraryDownloadActive()) {
      if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = null;
      }
      if (!active || nextNames !== names) {
        active = true;
        names = nextNames;
        onChange(true, names);
      }
      return;
    }
    if (!active || stopTimer) return;
    stopTimer = setTimeout(() => {
      stopTimer = null;
      if (libraryDownloadActive()) return;
      active = false;
      onChange(false, names);
    }, STOP_AFTER_IDLE_MS);
  };

  const offQueue = useOfflineJobStore.subscribe(update);
  const offPins = useOfflineLibraryPinStore.subscribe(update);
  update();
  return () => {
    offQueue();
    offPins();
    if (stopTimer) clearTimeout(stopTimer);
    if (active) {
      active = false;
      onChange(false, names);
    }
  };
}
