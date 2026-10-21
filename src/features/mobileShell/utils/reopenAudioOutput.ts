import { listen } from '@tauri-apps/api/event';
import { audioSetDevice } from '@/lib/api/audio';
import { useAuthStore } from '@/store/authStore';

/** Longest wait for the engine's `audio:device-changed` after reopening. */
const REOPEN_SETTLE_MS = 2000;

/**
 * The phone moved the app's audio somewhere else and the open output went dead: iOS after
 * an interruption, Android when the car (or another output) takes over the media route.
 * The engine keeps writing into the dead output and nothing plays until the app restarts.
 * Reopen the output the way an output-device switch does (`audio_set_device` with the
 * current device), and wait until the device bridge has handled the engine's
 * `audio:device-changed`, so a resume afterwards starts cleanly on the new output.
 */
export async function reopenAudioOutput(): Promise<void> {
  let settled!: () => void;
  const changed = new Promise<void>(resolve => { settled = resolve; });
  const off = await listen('audio:device-changed', () => settled());
  const timer = window.setTimeout(() => settled(), REOPEN_SETTLE_MS);
  try {
    await audioSetDevice({ deviceName: useAuthStore.getState().audioOutputDevice ?? null });
    await changed;
  } catch {
    // Reopen failed: the engine keeps its previous state; nothing more to do here.
  } finally {
    window.clearTimeout(timer);
    off();
  }
}
