//! iOS keeps an app's audio running behind the lock screen only when its audio
//! session uses the playback category (plus `UIBackgroundModes: audio` in
//! Info.plist). The default category silences the app when the screen locks.
//!
//! Calls, Siri and alarms interrupt that session, and unplugged headphones or a
//! lost Bluetooth device change its route. iOS does not pause the player for us,
//! so both reach the web layer as events (`ios-audio:interruption`,
//! `ios-audio:route-lost`) and the touch shell pauses / resumes the player.
//! A newly available output (CarPlay plugged in, headphones connected) can leave
//! the running output stalled on the old route; `ios-audio:route-new` lets the
//! touch shell reopen it.

use std::ptr::NonNull;

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

pub(crate) fn activate_playback() {
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
    if let Err(e) = result {
        crate::app_eprintln!("[audio] iOS audio session setup failed: {e}");
    }
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
            match reason {
                Some(ROUTE_OLD_DEVICE_UNAVAILABLE) => {
                    let _ = route_app.emit("ios-audio:route-lost", ());
                }
                Some(ROUTE_NEW_DEVICE_AVAILABLE) => {
                    let _ = route_app.emit("ios-audio:route-new", ());
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
