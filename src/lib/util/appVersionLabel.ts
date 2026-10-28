import { version } from '@/../package.json';

/**
 * The phone apps' platform name, shown next to the version; '' on the desktop. Read from
 * the build flags directly, not from `platform.ts`, which many tests replace with a mock.
 */
export const MOBILE_PLATFORM_NAME: string = __PSY_MOBILE_SHELL__ !== true
  ? ''
  : __PSY_MOBILE_PLATFORM__ === 'android' ? 'Android' : __PSY_MOBILE_PLATFORM__ === 'ios' ? 'iOS' : '';

/** The version as the app shows it: `1.57.0` on the desktop, `1.57.0 · Android` on a phone. */
export const APP_VERSION_LABEL: string = MOBILE_PLATFORM_NAME ? `${version} · ${MOBILE_PLATFORM_NAME}` : version;
