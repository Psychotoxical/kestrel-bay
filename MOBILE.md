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
| Native (Kotlin) | | `src-tauri/android/*.kt` (activity, media session, playback service, Android Auto) | |
| Touch UI (React) | `src/features/mobileShell/ios/` | `src/features/mobileShell/android/`, `src/styles/mobile/mobile-android.css` | the rest of `src/features/mobileShell/` and code behind `IS_MOBILE_SHELL` |
| Build config | `src-tauri/tauri.ios.conf.json`, `src-tauri/Info.ios.plist` | `src-tauri/tauri.android.conf.json`, `src-tauri/android/patch-gen.mjs` (patches the generated Gradle project) | `src-tauri/tauri.conf.json` |
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
- **Car and voice content is one code path.** `src/features/mobileShell/car/` builds the car
  lists and matches voice requests for both phones: CarPlay and Siri read it through
  `mobileShell/ios/`, Android Auto and the Google Assistant through
  `mobileShell/android/androidAuto.ts`. Test Android Auto on the PC with Google's Desktop Head
  Unit (`adb forward tcp:5277 tcp:5277`, head unit server started in the phone's Android Auto
  developer settings).

## Writing mobile code in shared files

Every line this branch adds to a file that also exists in `main` can collide with the next
change there. Keep that surface small:

- **One gate, then a separate file.** A desktop page or tab gets a single early return
  (`if (IS_MOBILE_SHELL) return <SystemTouchView … />;`) and the touch version lives in its own
  file. Avoid scattering `IS_MOBILE_SHELL ? … : …` through a desktop component.
- **Same data, same handlers.** The touch view reads the same stores and calls the same actions
  as the desktop view; only the presentation differs. Settings stay one setting, never a
  mobile copy.
- **Behaviour changes go in the register below**, with a short comment at the code that points
  here (`// Mobile: see MOBILE.md "Deliberate differences"`).
- **New strings in all 16 languages**, also for mobile-only text.

## Keeping up with `main`

`main` moves on all the time (Psychotoxical, cucadmuh, outside contributors). Small merges are
cheap; a backlog of many PRs is not. So:

1. **When:** after every merge into `main`, at the latest at the start of a working session and
   before every TestFlight build or tester APK. Measure first:
   `git fetch psysonic main && git rev-list --count $(git merge-base HEAD psysonic/main)..psysonic/main`.
2. **Trial run:** `git merge-tree --write-tree --name-only HEAD psysonic/main` lists the
   conflicts without touching the tree.
3. **Merge:** `git merge --no-ff --no-commit psysonic/main` on `psysonic-mobile` (the remote
   `psysonic` is read-only; never push to it).
4. **Resolving conflicts:** desktop behaviour from `main` wins; then put the mobile gate back on
   top. Never resolve by dropping either side wholesale. For the files in the register below,
   read the entry before resolving.
5. **Follow the new features into the touch UI.** A merge can be clean and still miss mobile:
   a new setting, column or button in a desktop component often has a touch twin in
   `mobileShell/` or a `*Mobile.tsx` / `*Touch*.tsx` file that `main` does not know about.
   For each merged PR ask: does the touch version need the same change? (Example: #1787 hid
   star ratings in `ArtistDetailHero`; the touch header `ArtistDetailHeroMobile` needed the same
   gate.)
6. **Check before committing:** `npx tsc --noEmit -p .`, ESLint on the touched files,
   `npx vitest run` **and** `npx vitest run -c vitest.mobile.config.ts`, an Android debug build
   on a phone, and the `check` mode of `ios.yml` and `android.yml` after pushing.
7. **Rust:** when `main` changes code listed under "Shared Rust" below, build for both phones;
   `cargo check` on the desktop does not compile the `cfg(mobile)` arms.

## Deliberate differences from the desktop

These are on purpose. Do not "fix" them back to the desktop behaviour, and keep them in mind
when changing the files involved. Pure layout swaps (touch components, `DesktopOnly` /
`TouchOnly` sections) are not listed; about 160 such gates exist in shared code.

### Storage and data

| What | Why | Where | Watch out |
|---|---|---|---|
| The download index (`psysonic-local-playback`, `psysonic-local-playback-collision-recovery-v1:*`) lives in IndexedDB `psysonic-large-storage`, preloaded into memory before the app mounts; writes go out in the background. A leftover localStorage copy wins at startup and is moved over. | The WebView's localStorage holds about 5.2 M characters; the index needs about 650 per track, so downloads were forgotten after about 7900 tracks. | `src/lib/util/largeStorage.ts`, `src/main.tsx` (`preloadLargeStorage`, mobile only) | Persisted stores must go through `safeStorage` / `largeAwareStorage`, never raw `localStorage`. Code that must be durable before moving on calls `flushLargeStorage()`. |
| `safeStorage` and the Navidrome canonical-ID migration default to `largeAwareStorage` (also on desktop, where it is plain localStorage); the coordinator flushes before its checkpoint. | The migration rewrites the download index. | `src/lib/util/safeStorage.ts`, `src/app/migrations/navidromeCanonical{Backup,Coordinator,Frontend}.ts` | Do not reintroduce `= localStorage` defaults when merging. |
| Lookups into the download index use indexes cached per `entries` object (`entriesForTrackId`, `pinnedGroupsCache`, `serverIndexKeySet`). | Full scans froze the UI with thousands of downloads. | `src/store/localPlaybackResolve.ts`, `src/store/localPlaybackStore.ts`, `src/features/offline/utils/offlineLocalBrowse.ts` | Always replace `entries` with a new object; mutating it in place serves stale results. |
| Backups never contain `psysonic-large-storage` or `psysonic-offline-only`. | Device-local media records and the offline switch would leave nothing playable on another device. | `src/features/settings/utils/backupRegistry.ts` (`BACKUP_EXCLUSIONS`) | Keep them when the registry is reshuffled. |
| Backup import refuses `.psyfull`, `.psylib` and `.zip` on mobile; the Android file picker has no extension filter. | Reading a whole archive as text can run a phone out of memory; Android filters by MIME type and greyed every backup out. | `src/features/settings/utils/backup.ts` | |
| Exports write into the documents folder and then offer the file; picked `content://` files are copied into the app cache first. | Mobile pickers return empty documents or SAF URIs, not paths. | `src/lib/util/exportFile.ts` | Always use `pickExportPath` / `offerExportFile` / `localCopyOfPicked`, never `save()` / `open()` directly. |
| The offline switch is persisted and always available on mobile. | It is a real offline mode on the phone. | `src/store/devOfflineBrowseStore.ts`, `src/features/offline/utils/offlineBrowseMode.ts` | Do not re-gate it on `import.meta.env.DEV`. |

### Playback and audio

| What | Why | Where | Watch out |
|---|---|---|---|
| App volume pinned to 100 %. | The hardware buttons set loudness; the desktop default of 80 % played noticeably quieter. | `src/features/mobileShell/utils/fullAppVolume.ts` | Changes to volume semantics in the player store reach the phones. |
| Playback rate, Hi-Res and track-change notifications are always off on mobile, even when a desktop backup switched them on. | No controls for them on touch. | `src/features/playback/store/playbackRateStore.ts`, `src/features/playback/utils/audio/playbackRateHelpers.ts`, `src/lib/audio/hiResCrossfadeResample.ts`, `src/features/playback/utils/notifications/trackNotificationScheduler.ts` | Read these settings through the helpers, not from the store directly. |
| The infinite queue also tops up when a gapless song starts. | On a phone the queue ran empty because top-up only ran on "next". | `src/features/playback/store/infiniteQueueTopUp.ts` (extracted from `nextAction.ts`) | Fixes to the top-up belong in the extracted function. |
| The play queue is pulled from the server once at startup. | A swiped-away app never flushes; in the car, Play comes right after launch. | `src/app/hooks/useIdlePlayQueuePull.ts` | |
| Lock-screen skips are ignored for an Orbit guest. | A skip would only stop the local player. | `src/app/tauriBridge/useMediaAndWindowBridge.ts` | |
| Media controls get the radio station logo from disk; the Android media session is fed from the shared MPRIS wrapper. | Lock screen, CarPlay and Android Auto only show covers from files; Android has no souvlaki backend. | `src/cover/integrations/mpris.ts`, `src/lib/api/mpris.ts`, `src/features/playback/store/audioListenerSetup/mprisSync.ts` | Call the wrapper, not `commands.mprisSet*` directly. |

### Shared Rust

| What | Why | Where | Watch out |
|---|---|---|---|
| iOS activates its audio session and Android sets up its context before the engine opens output; iOS installs scene and Siri hooks between `build()` and `run()`. | Playback must survive the lock screen; AAudio needs the activity. | `src-tauri/src/lib.rs` | Keep the `build()…run()` split; do not open audio earlier in `run()`. |
| Tray, window state, shortcuts, single instance, mini player and window APIs are `cfg(desktop)`; tray commands have mobile stubs. | They do not exist on phones; the frontend calls them unconditionally. | `src-tauri/src/lib.rs`, `src-tauri/src/lib_commands/sync/tray_mobile.rs`, `lib_commands/ui/mini.rs`, `lib_commands/app_api/integration.rs` | New plugins, tray commands or window calls need a gate (and a stub), or the mobile build breaks. |
| Cover URLs for the iOS media controls are reduced to local file paths; no desktop notifications on iOS. | souvlaki's iOS backend aborts the app on remote URLs. | `src-tauri/src/lib_commands/app_api/integration.rs`, `src-tauri/Cargo.toml` | |
| External links open through the `open_external_url` command. | The JS shell `open` spawns a process, which iOS forbids. | `src/lib/api/externalLink.ts` | Never import `open` from `@tauri-apps/plugin-shell` in the UI. |
| The streaming preserve worker sleeps instead of spinning when its buffer is full (iOS). | iOS kills background apps that busy-loop a core (#1760). | `src-tauri/crates/psysonic-audio/src/preserve_worker.rs` | When `main` reworks this file (#1788), take `main`'s version if it fixes the spin for every platform. |
| Android reopens the audio output when the route is lost; `power_resume` is built for both phones. | Android Auto and Bluetooth disconnect AAudio and the car stayed silent. | `src-tauri/crates/psysonic-audio/src/output_lost.rs`, `engine/output_stream.rs`, `power_resume.rs` | |
| Library database write commands run off the main thread. | Synchronous commands blocked the UI on the writer lock. | `src-tauri/crates/psysonic-library/src/commands.rs`, `browse_support.rs` | Keep them `async` + `spawn_blocking` when merging. |

### Network and downloads

| What | Why | Where | Watch out |
|---|---|---|---|
| On mobile data or a hotspot, downloads wait for Wi-Fi unless the user allows that album, playlist or artist for the session. | No mobile data without consent. | `src/features/offline/utils/meteredDownloadGate.ts`, `src/lib/network/meteredNetwork.ts`, `src/features/offline/utils/offlinePinQueue.ts` | Changes to the pin queue's slot accounting can deadlock or bypass the gate. |
| `/` and `/library` stay open while offline. | They are the phone's home screens. | `src/features/offline/utils/offlineBrowseRouting.ts` | |

### Settings and defaults

| What | Why | Where |
|---|---|---|
| Default font is the system font; interface scale is not applied. | Text follows the phone's settings. | `src/store/fontStore.ts`, `src/app/AppShell.tsx` |
| No fullscreen auto-open, no start-minimised, no mini-player preload, no GitHub updater; lyrics always scroll classic; track lists always show covers. | Desktop-only concepts or touch layout needs. | `useFsAutoOpen.ts`, `readStartMinimizedToTray.ts`, `MainApp.tsx`, `AppShell.tsx`, `LyricsPane.tsx`, `useTrackListCoverArtSettings.ts` |
| Streaming quality is edited under Settings → Audio, per address of the active server. | It was hidden at the bottom of the server sheet. | `src/features/settings/components/audio/StreamQualityTouchSection.tsx` (same setting as the server form) |
| Confirmations use a sheet instead of `window.confirm`. | `confirm()` is unreliable in the mobile WebView. | `src/features/settings/utils/confirmChoice.ts` |

A setting that is read somewhere new, without going through these gates, can arrive on the
phone from a desktop backup. Check the touch side when adding one.

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
