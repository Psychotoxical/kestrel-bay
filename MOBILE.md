# Psysonic Mobile (iOS and Android)

This branch (`psysonic-mobile`) holds the Psysonic apps for iPhone/iPad and Android. It is
**not** part of the main Psysonic repository: Psysonic `main` is merged into this branch at
regular intervals, and the mobile apps are built from here.

## Who works here

Only **Psychotoxical** and **cucadmuh**. Pull requests from anyone else are closed with a
pointer to the main repository.

**Want to contribute a feature?** Please open it against
[Psysonic main](https://github.com/Psysonic/psysonic). Everything that lands there reaches the
mobile apps with the next merge, so desktop, iOS and Android stay in step.

## Map: whose code is where

| Area | iOS only | Android only | Shared by both apps |
|---|---|---|---|
| Native (Rust) | `src-tauri/src/ios/` | `src-tauri/src/android/` | everything else in `src-tauri/` behind `cfg(mobile)` |
| Touch UI (React) | `src/features/mobileShell/ios/` | `src/features/mobileShell/android/` | the rest of `src/features/mobileShell/` and code behind `IS_MOBILE_SHELL` |
| Build config | `src-tauri/tauri.ios.conf.json`, `src-tauri/Info.ios.plist` | `src-tauri/tauri.android.conf.json`, `src-tauri/android/` (patches the generated Gradle project) | `src-tauri/tauri.conf.json` |
| CI | `.github/workflows/ios.yml` | `.github/workflows/android.yml` | |

Rules of thumb:

- **iOS territory** and **Android territory** are compiled into one app only
  (`target_os = "ios"` / `"android"` in Rust, `IS_IOS` / `IS_ANDROID` in the UI). A change there
  cannot reach the other app or the desktop.
- **Shared touch code** runs in both apps. A change there must work on iOS **and** Android:
  after pushing such a change, run the `check` mode of both `ios.yml` and `android.yml`.
- **Desktop code** must not change because of the mobile apps. Mobile differences sit behind
  `IS_MOBILE_SHELL` (UI) or `cfg(mobile)` (Rust).
- **Same features on both phones.** What one app gets, the other gets too, unless the
  platform makes it impossible (CarPlay ↔ Android Auto, Siri ↔ Google Assistant).

## Building

- iOS: `ios.yml` (`check`, `testflight`, `crashlogs`, `feedback`, `symbols`), runs on macOS in CI.
- Android: `android.yml` (`check`, `apk`), runs on Linux in CI; local builds need the Android
  SDK, NDK, CMake with Ninja and JDK 17. After `npx tauri android init`, run
  `node src-tauri/android/patch-gen.mjs` before building. Build test APKs with
  `CARGO_PROFILE_DEV_OPT_LEVEL=3 CARGO_PROFILE_DEV_DEBUG=line-tables-only`: unoptimised Rust is
  too slow on a phone (the first library sync blocks every page).
- Both workflows start by hand only (`gh workflow run <file> --ref psysonic-mobile -f mode=…`).
  GitHub offers that only for workflow files that also exist on this repository's `main`, so
  `main` keeps a copy of each; the run itself uses the version on `psysonic-mobile`.
