// ⚠️ Android territory. Run after `tauri android init` (CI and local builds): the
// generated Gradle project under `src-tauri/gen/android` is not in git, so whatever the
// Android app needs beyond Tauri's template is added here, idempotently.
//
// Today: the Kotlin half of `rustls-platform-verifier` (reqwest checks certificates
// through Android's trust store). The crate ships it as a local Maven repository; its
// path comes from `cargo metadata`, so the version always matches Cargo.lock.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const srcTauri = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const gradleFile = join(srcTauri, 'gen', 'android', 'app', 'build.gradle.kts');
const MARKER = '// psysonic: rustls-platform-verifier';

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

// Release builds shrink with R8, which cannot see the JNI calls into the verifier.
// The template already feeds every `*.pro` under app/ to R8.
writeFileSync(
  join(srcTauri, 'gen', 'android', 'app', 'rustls-platform-verifier.pro'),
  '-keep, includedescriptorclasses class org.rustls.platformverifier.** { *; }\n',
);

let gradle = readFileSync(gradleFile, 'utf8');
if (gradle.includes(MARKER)) {
  console.log('[patch-gen] already patched');
  process.exit(0);
}

const repoBlock = `${MARKER}
repositories {
    maven {
        url = uri("${mavenDir}")
    }
}

dependencies {`;
const depLine = `    implementation("rustls:rustls-platform-verifier:${pkg.version}")\n`;

const depsOpen = /^dependencies \{\r?\n/m;
if (!depsOpen.test(gradle)) throw new Error('no top-level dependencies block in build.gradle.kts');
gradle = gradle.replace(depsOpen, `${repoBlock}\n${depLine}`);
writeFileSync(gradleFile, gradle);
console.log(`[patch-gen] added rustls-platform-verifier ${pkg.version} from ${mavenDir}`);
