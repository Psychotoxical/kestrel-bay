//! iOS keeps an app's audio running behind the lock screen only when its audio
//! session uses the playback category (plus `UIBackgroundModes: audio` in
//! Info.plist). The default category silences the app when the screen locks.
//!
//! Calls, Siri and alarms interrupt that session, and unplugged headphones or a
//! lost Bluetooth device change its route. iOS does not pause the player for us,
//! so both reach the web layer as events (`ios-audio:interruption`,
//! `ios-audio:route-lost`) and the touch shell pauses / resumes the player.
//! A newly available output (CarPlay plugged in, headphones connected) can leave
//! the running output stalled on the old route, so the engine reopens it the way
//! it does after a system resume: the track carries on where it was.

use std::ptr::NonNull;
use std::sync::atomic::{AtomicBool, Ordering};

use block2::RcBlock;
use objc2_avf_audio::{
    AVAudioSession, AVAudioSessionCategoryPlayback, AVAudioSessionInterruptionNotification,
    AVAudioSessionInterruptionOptionKey, AVAudioSessionInterruptionTypeKey,
    AVAudioSessionRouteChangeNotification, AVAudioSessionRouteChangeReasonKey,
};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSNumber, NSString};
use tauri::{AppHandle, Emitter};

/// `AVAudioSessionInterruptionTypeBegan` (ended is 0).
const INTERRUPTION_BEGAN: usize = 1;
/// `AVAudioSessionInterruptionOptionShouldResume`.
const OPTION_SHOULD_RESUME: usize = 1;
/// `AVAudioSessionRouteChangeReasonNewDeviceAvailable`: CarPlay or headphones connected.
const ROUTE_NEW_DEVICE_AVAILABLE: usize = 1;
/// `AVAudioSessionRouteChangeReasonOldDeviceUnavailable`: headphones unplugged, Bluetooth gone.
const ROUTE_OLD_DEVICE_UNAVAILABLE: usize = 2;

/// Whether the last activation went through. The app can be started in the background by
/// CarPlay, where activating fails (`'!int'`: cannot interrupt others); playback then runs
/// silently until something activates the session again.
static SESSION_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Activates the session again, with pauses, until iOS lets it through, then reopens the
/// output the way a system resume does (the engine may have opened it while inactive).
/// Does nothing while the session is active.
pub(crate) fn retry_activation(app: &AppHandle) {
    if SESSION_ACTIVE.load(Ordering::Relaxed) || RETRY_RUNNING.swap(true, Ordering::Relaxed) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        for pause_s in [0u64, 1, 2, 4, 8, 15] {
            if pause_s > 0 {
                tokio::time::sleep(std::time::Duration::from_secs(pause_s)).await;
            }
            if SESSION_ACTIVE.load(Ordering::Relaxed) || activate_playback() {
                crate::app_eprintln!("[audio] iOS audio session active again");
                if crate::audio::debounce_allow_resume_reopen() {
                    crate::audio::reopen_audio_after_system_resume(&app).await;
                }
                break;
            }
        }
        RETRY_RUNNING.store(false, Ordering::Relaxed);
    });
}

static RETRY_RUNNING: AtomicBool = AtomicBool::new(false);

/// CarPlay connected. Reconnecting while the app runs does not always post a route change
/// (seen 20.10.: CarPlay back, no notification, tracks played into silence), so the output
/// is not left to the route-change handler: once the route has settled, activate the
/// session and reopen the output on whatever route is current now.
pub(crate) fn car_connected(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
        let active = activate_playback();
        crate::app_eprintln!(
            "[audio] CarPlay connected: session active={} outputs={}",
            active,
            current_outputs()
        );
        if !active {
            // Started in the background by CarPlay: keep trying, it reopens once through.
            retry_activation(&app);
            return;
        }
        if crate::audio::debounce_allow_resume_reopen() {
            crate::audio::reopen_audio_after_system_resume(&app).await;
        }
    });
}

pub(crate) fn activate_playback() -> bool {
    // SAFETY: AVAudioSession is a process-wide singleton; category and
    // activation calls are allowed from any thread.
    let result = unsafe {
        let session = AVAudioSession::sharedInstance();
        match AVAudioSessionCategoryPlayback {
            Some(category) => session
                .setCategory_error(category)
                .and_then(|()| session.setActive_error(true))
                .map_err(|e| format!("{e:?}")),
            None => Err("playback category unavailable".to_string()),
        }
    };
    SESSION_ACTIVE.store(result.is_ok(), Ordering::Relaxed);
    if let Err(e) = &result {
        crate::app_eprintln!("[audio] iOS audio session setup failed: {e}");
    }
    result.is_ok()
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct InterruptionPayload {
    began: bool,
    should_resume: bool,
}

/// Forwards session interruptions and lost / new output routes to the web layer.
/// The observers live as long as the app.
pub(crate) fn observe_interruptions(app: &AppHandle) {
    // The activation in `run()` may have failed before the app handle existed.
    retry_activation(app);
    let center = NSNotificationCenter::defaultCenter();

    let interruption_app = app.clone();
    let on_interruption: RcBlock<dyn Fn(NonNull<NSNotification>)> =
        RcBlock::new(move |note: NonNull<NSNotification>| {
            // SAFETY: the notification centre hands us a live notification for the call.
            let note = unsafe { note.as_ref() };
            // SAFETY: the keys are immutable framework constants.
            let (type_key, option_key) = unsafe {
                (
                    AVAudioSessionInterruptionTypeKey,
                    AVAudioSessionInterruptionOptionKey,
                )
            };
            let began = number_for(note, type_key) == Some(INTERRUPTION_BEGAN);
            let should_resume = number_for(note, option_key)
                .is_some_and(|options| options & OPTION_SHOULD_RESUME != 0);
            crate::app_eprintln!(
                "[audio] iOS interruption {} should_resume={} outputs={}",
                if began { "began" } else { "ended" },
                should_resume,
                current_outputs()
            );
            if !began {
                // The session has to be active again before the player resumes.
                activate_playback();
            }
            let _ = interruption_app.emit(
                "ios-audio:interruption",
                InterruptionPayload {
                    began,
                    should_resume,
                },
            );
        });

    let route_app = app.clone();
    let on_route_change: RcBlock<dyn Fn(NonNull<NSNotification>)> =
        RcBlock::new(move |note: NonNull<NSNotification>| {
            // SAFETY: as above.
            let note = unsafe { note.as_ref() };
            // SAFETY: immutable framework constant.
            let reason_key = unsafe { AVAudioSessionRouteChangeReasonKey };
            let reason = number_for(note, reason_key);
            crate::app_eprintln!(
                "[audio] iOS route change reason={} outputs={}",
                reason.map_or_else(|| "?".to_string(), |r| r.to_string()),
                current_outputs()
            );
            retry_activation(&route_app);
            match reason {
                Some(ROUTE_OLD_DEVICE_UNAVAILABLE) => {
                    let _ = route_app.emit("ios-audio:route-lost", ());
                }
                Some(ROUTE_NEW_DEVICE_AVAILABLE) => {
                    if crate::audio::debounce_allow_resume_reopen() {
                        let app = route_app.clone();
                        tauri::async_runtime::spawn(async move {
                            crate::audio::reopen_audio_after_system_resume(&app).await;
                        });
                    }
                }
                _ => {}
            }
        });

    // SAFETY: the names are framework constants; no object filter and no queue
    // (the blocks run on the posting thread and only emit events).
    let observers = unsafe {
        (
            center.addObserverForName_object_queue_usingBlock(
                AVAudioSessionInterruptionNotification,
                None,
                None,
                &on_interruption,
            ),
            center.addObserverForName_object_queue_usingBlock(
                AVAudioSessionRouteChangeNotification,
                None,
                None,
                &on_route_change,
            ),
        )
    };
    std::mem::forget(observers);
}

/// Port types of the session's current outputs (e.g. `CarAudio`, `Speaker`), for the log.
fn current_outputs() -> String {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    // SAFETY: plain getters on the process-wide session; nil is checked at every step.
    unsafe {
        let session = AVAudioSession::sharedInstance();
        let route: *mut AnyObject = msg_send![&*session, currentRoute];
        if route.is_null() {
            return "-".to_string();
        }
        let outputs: *mut AnyObject = msg_send![route, outputs];
        if outputs.is_null() {
            return "-".to_string();
        }
        let count: usize = msg_send![outputs, count];
        let mut ports = Vec::with_capacity(count);
        for index in 0..count {
            let port: *mut AnyObject = msg_send![outputs, objectAtIndex: index];
            let port_type: *mut NSString = msg_send![port, portType];
            if let Some(port_type) = port_type.as_ref() {
                ports.push(port_type.to_string());
            }
        }
        if ports.is_empty() {
            "-".to_string()
        } else {
            ports.join(",")
        }
    }
}

/// The unsigned number stored under `key` in the notification's userInfo.
fn number_for(note: &NSNotification, key: Option<&NSString>) -> Option<usize> {
    let info = note.userInfo()?;
    let value = info.objectForKey(key?.as_ref())?;
    let number = value.downcast::<NSNumber>().ok()?;
    Some(number.unsignedIntegerValue())
}
