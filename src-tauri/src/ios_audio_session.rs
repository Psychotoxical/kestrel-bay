//! iOS keeps an app's audio running behind the lock screen only when its audio
//! session uses the playback category (plus `UIBackgroundModes: audio` in
//! Info.plist). The default category silences the app when the screen locks.
//!
//! Calls, Siri and alarms interrupt that session, and unplugged headphones or a
//! lost Bluetooth device change its route. iOS does not pause the player for us,
//! so both reach the web layer as events (`ios-audio:interruption`,
//! `ios-audio:route-lost`) and the touch shell pauses / resumes the player.

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

/// Forwards session interruptions and lost output routes to the web layer.
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
            if number_for(note, reason_key) == Some(ROUTE_OLD_DEVICE_UNAVAILABLE) {
                let _ = route_app.emit("ios-audio:route-lost", ());
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

/// The unsigned number stored under `key` in the notification's userInfo.
fn number_for(note: &NSNotification, key: Option<&NSString>) -> Option<usize> {
    let info = note.userInfo()?;
    let value = info.objectForKey(key?.as_ref())?;
    let number = value.downcast::<NSNumber>().ok()?;
    Some(number.unsignedIntegerValue())
}
