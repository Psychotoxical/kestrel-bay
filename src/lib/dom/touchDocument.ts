import { IS_ANDROID, IS_IOS, IS_MOBILE_SHELL } from '@/lib/util/platform';

/**
 * Touch shell: marks the document for the touch styles and stops page zoom.
 * Runs at start-up, before anything renders, so screens shown ahead of the app
 * shell (the login page) behave like the rest of the app. No-op on desktop.
 */
export function prepareTouchDocument(): void {
  if (!IS_MOBILE_SHELL) return;
  // Portaled overlays (search, sheets, modals) and the login page live outside `.app-shell`.
  document.documentElement.setAttribute('data-mobile-app', 'true');
  // Which phone app: platform-only styles (`styles/mobile/mobile-android.css`) key on it.
  if (IS_IOS || IS_ANDROID) {
    document.documentElement.setAttribute('data-mobile-os', IS_ANDROID ? 'android' : 'ios');
  }
  // iOS zooms into inputs below 16px on focus and lets a pinch zoom the page; an app never wants that.
  document.querySelector('meta[name="viewport"]')?.setAttribute(
    'content',
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover',
  );
}
