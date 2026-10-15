//! iOS keeps an app's audio running behind the lock screen only when its audio
//! session uses the playback category (plus `UIBackgroundModes: audio` in
//! Info.plist). The default category silences the app when the screen locks.

use objc2_avf_audio::{AVAudioSession, AVAudioSessionCategoryPlayback};

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
