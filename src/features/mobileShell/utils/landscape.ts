/**
 * Phones stay upright; only the full-screen player may turn sideways. iOS:
 * `ios/iosOrientation.ts` (the iPad turns freely); Android: `MainActivity.allowLandscape`
 * in `src-tauri/android/` (tablets turn freely). Upright is the default on both.
 */
import { allowLandscape as allowIosLandscape } from '@/features/mobileShell/ios/iosOrientation';
import { IS_ANDROID } from '@/lib/util/platform';

export function allowLandscape(allowed: boolean): void {
  if (IS_ANDROID) {
    window.PsysonicAndroidShell?.allowLandscape?.(allowed);
    return;
  }
  allowIosLandscape(allowed);
}
