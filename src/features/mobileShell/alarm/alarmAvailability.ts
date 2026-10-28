/**
 * ⚠️ Android territory. The music alarm is off on Android for now: Play Protect blocks a
 * sideloaded APK that asks for the alarm's permissions (exact alarms, full-screen intent,
 * start after boot, drawing over apps, battery exemption) as a harmful app, so the build
 * leaves them out (`src-tauri/android/patch-gen.mjs`). It comes back once Psysonic ships
 * through the Play Store, where an alarm feature can declare them. The code stays.
 */
export const ANDROID_ALARM_AVAILABLE: boolean = false;
