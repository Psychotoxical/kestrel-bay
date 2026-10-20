//! Android: hand the Java VM and the activity to the crates that call into Java.
//! - `ndk-context` for cpal's AAudio backend, which aborts when nobody set it.
//! - `rustls-platform-verifier`, which reqwest uses to check server certificates through
//!   Android's own trust store (its Kotlin half comes in via `src-tauri/android/patch-gen.mjs`).
//!
//! tao starts `run` on its own thread while the activity is still being created, so the
//! context can arrive a moment after `run` begins: wait for it briefly.

use std::time::{Duration, Instant};

use jni::objects::JObject;
use jni::JavaVM;

const WAIT_LIMIT: Duration = Duration::from_secs(5);
const POLL_STEP: Duration = Duration::from_millis(10);

pub fn init() {
    let started = Instant::now();
    let ctx = loop {
        if let Some(ctx) = tao::platform::android::prelude::main_android_context() {
            break ctx;
        }
        if started.elapsed() >= WAIT_LIMIT {
            crate::app_eprintln!(
                "[android] no activity context after 5 s, audio and HTTPS may fail"
            );
            return;
        }
        std::thread::sleep(POLL_STEP);
    };

    unsafe {
        ndk_context::initialize_android_context(ctx.java_vm, ctx.context_jobject);
    }

    // SAFETY: tao keeps the VM pointer and a global reference to the activity alive for
    // the whole process; the verifier takes its own global reference from it.
    let vm = unsafe { JavaVM::from_raw(ctx.java_vm.cast()) };
    let result = vm.attach_current_thread(|env| -> Result<(), jni::errors::Error> {
        let activity = unsafe { JObject::from_raw(env, ctx.context_jobject.cast()) };
        rustls_platform_verifier::android::init_with_env(env, activity)
    });
    match result {
        Ok(()) => crate::app_eprintln!(
            "[android] context ready after {} ms",
            started.elapsed().as_millis()
        ),
        Err(e) => crate::app_eprintln!("[android] certificate verifier init failed: {e}"),
    }
}
