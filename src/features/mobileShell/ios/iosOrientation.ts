import { emit } from '@tauri-apps/api/event';

let landscapeAllowed = false;

/**
 * iPhone: only the full-screen player may turn sideways. The native side
 * (`src-tauri/src/ios/orientation.rs`) listens for `ios:allow-landscape` and
 * allows landscape or turns the interface back upright; the iPad ignores it.
 */
export function allowLandscape(allowed: boolean): void {
  landscapeAllowed = allowed;
  void emit('ios:allow-landscape', allowed).catch(() => {});
}

/**
 * Sends the current state once more. At start the window still allows every
 * orientation, so the shell locks it upright unless the player is already open.
 */
export function syncLandscape(): void {
  allowLandscape(landscapeAllowed);
}
