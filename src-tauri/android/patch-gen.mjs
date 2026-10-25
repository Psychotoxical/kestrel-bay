// ⚠️ Android territory. Run after `tauri android init` (CI and local builds): the
// generated Gradle project under `src-tauri/gen/android` is not in git, so whatever the
// Android app needs beyond Tauri's template is added here. Every step is idempotent.
//
// - every `*.kt` in this folder into the app's package (our MainActivity replaces the
//   template's; PsysonicMedia + PsysonicMediaService: lock screen and background play;
//   PsysonicAutoService: Android Auto; PsysonicDownloadService: whole-library downloads
//   in the background), and everything under `res/` into the app's res/;
// - the manifest entries those need (services, Android Auto, permissions);
// - Gradle dependencies: `androidx.media` (MediaSession, media notification) and the
//   Kotlin half of `rustls-platform-verifier` (reqwest checks certificates through
//   Android's trust store). The verifier ships it as a local Maven repository; its path
//   comes from `cargo metadata`, so the version always matches Cargo.lock.

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcTauri = resolve(here, '..');
const appDir = join(srcTauri, 'gen', 'android', 'app');
const gradleFile = join(appDir, 'build.gradle.kts');
const manifestFile = join(appDir, 'src', 'main', 'AndroidManifest.xml');
const packageDir = join(appDir, 'src', 'main', 'java', 'dev', 'psysonic', 'player');

const ANDROIDX_MEDIA = 'androidx.media:media:1.7.0';

// ── Kotlin sources
for (const file of readdirSync(here).filter(f => f.endsWith('.kt'))) {
  copyFileSync(join(here, file), join(packageDir, file));
}

// ── Resources: everything under ./res (drawables, xml) into the app's res/
const resSource = join(here, 'res');
const resTarget = join(appDir, 'src', 'main', 'res');
for (const folder of readdirSync(resSource)) {
  mkdirSync(join(resTarget, folder), { recursive: true });
  for (const file of readdirSync(join(resSource, folder))) {
    copyFileSync(join(resSource, folder, file), join(resTarget, folder, file));
  }
}

// ── Manifest: each permission and the service only once
const PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
  'android.permission.WAKE_LOCK',
  'android.permission.ACCESS_NETWORK_STATE',
  // The music alarm (PsysonicAlarm): exact alarms (granted to alarm clocks, Android 13+), set
  // again after a reboot, shown over the lock screen, with a notification and vibration.
  'android.permission.USE_EXACT_ALARM',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.VIBRATE',
  // Opening the alarm over an unlocked phone (a start from the background, see PsysonicAlarm).
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
];
const serviceMarker = '<!-- psysonic: media service -->';
// `[ \t]`, not `\s`: in a CRLF file `^` also matches after the `\r`.
const internet = /^([ \t]*<uses-permission android:name="android\.permission\.INTERNET" \/>\r?\n)/m;
const appClose = /^([ \t]*<\/application>)/m;
let manifest = readFileSync(manifestFile, 'utf8');
if (!internet.test(manifest) || !appClose.test(manifest)) {
  throw new Error('AndroidManifest.xml does not look like the Tauri template');
}
const missing = PERMISSIONS.filter(p => !manifest.includes(`android:name="${p}"`));
if (missing.length > 0) {
  const lines = missing.map(p => `    <uses-permission android:name="${p}" />`).join('\n');
  manifest = manifest.replace(internet, `$1${lines}\n`);
  console.log(`[patch-gen] manifest: ${missing.join(', ')}`);
}
if (!manifest.includes(serviceMarker)) {
  manifest = manifest.replace(appClose, `        ${serviceMarker}
        <service
            android:name=".PsysonicMediaService"
            android:exported="false"
            android:foregroundServiceType="mediaPlayback" />
$1`);
  console.log('[patch-gen] manifest: media service');
}
// Android 12 asks the user for exact alarms; from 13 on USE_EXACT_ALARM covers them.
const exactAlarmBefore13 = 'android.permission.SCHEDULE_EXACT_ALARM';
if (!manifest.includes(`android:name="${exactAlarmBefore13}"`)) {
  manifest = manifest.replace(internet, `$1    <uses-permission android:name="${exactAlarmBefore13}" android:maxSdkVersion="32" />
`);
}
const alarmMarker = '<!-- psysonic: alarm -->';
if (!manifest.includes(alarmMarker)) {
  manifest = manifest.replace(appClose, `        ${alarmMarker}
        <receiver
            android:name=".PsysonicAlarmReceiver"
            android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
                <action android:name="android.intent.action.TIME_SET" />
                <action android:name="android.intent.action.TIMEZONE_CHANGED" />
            </intent-filter>
        </receiver>
        <service
            android:name=".PsysonicAlarmService"
            android:exported="false"
            android:foregroundServiceType="mediaPlayback" />
$1`);
  console.log('[patch-gen] manifest: alarm');
}
const downloadMarker = '<!-- psysonic: download service -->';
if (!manifest.includes(downloadMarker)) {
  manifest = manifest.replace(appClose, `        ${downloadMarker}
        <service
            android:name=".PsysonicDownloadService"
            android:exported="false"
            android:foregroundServiceType="dataSync" />
$1`);
  console.log('[patch-gen] manifest: download service');
}
const autoMarker = '<!-- psysonic: android auto -->';
if (!manifest.includes(autoMarker)) {
  manifest = manifest.replace(appClose, `        ${autoMarker}
        <service
            android:name=".PsysonicAutoService"
            android:exported="true">
            <intent-filter>
                <action android:name="android.media.browse.MediaBrowserService" />
            </intent-filter>
        </service>
        <meta-data
            android:name="com.google.android.gms.car.application"
            android:resource="@xml/automotive_app_desc" />
$1`);
  console.log('[patch-gen] manifest: android auto');
}
writeFileSync(manifestFile, manifest);

// ── R8 (release builds) cannot see JNI calls into the verifier. The template already
// feeds every `*.pro` under app/ to R8.
writeFileSync(
  join(appDir, 'rustls-platform-verifier.pro'),
  '-keep, includedescriptorclasses class org.rustls.platformverifier.** { *; }\n',
);

// ── Gradle
let gradle = readFileSync(gradleFile, 'utf8');
const depsOpen = /^dependencies \{\r?\n/m;
if (!depsOpen.test(gradle)) throw new Error('no top-level dependencies block in build.gradle.kts');

const verifierMarker = '// psysonic: rustls-platform-verifier';
if (!gradle.includes(verifierMarker)) {
  const metadata = JSON.parse(
    execFileSync(
      'cargo',
      ['metadata', '--format-version', '1', '--filter-platform', 'aarch64-linux-android',
        '--manifest-path', join(srcTauri, 'Cargo.toml')],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    ),
  );
  const pkg = metadata.packages.find(p => p.name === 'rustls-platform-verifier-android');
  if (!pkg) throw new Error('rustls-platform-verifier-android not in the Android dependency graph');
  const mavenDir = join(dirname(pkg.manifest_path), 'maven').replaceAll('\\', '/');
  gradle = gradle.replace(depsOpen, `${verifierMarker}
repositories {
    maven {
        url = uri("${mavenDir}")
    }
}

dependencies {
    implementation("rustls:rustls-platform-verifier:${pkg.version}")
`);
  console.log(`[patch-gen] gradle: rustls-platform-verifier ${pkg.version} from ${mavenDir}`);
}

if (!gradle.includes(ANDROIDX_MEDIA)) {
  gradle = gradle.replace(depsOpen, `dependencies {\n    implementation("${ANDROIDX_MEDIA}")\n`);
  console.log(`[patch-gen] gradle: ${ANDROIDX_MEDIA}`);
}
writeFileSync(gradleFile, gradle);
