//! Keeps the screen on while the web layer asks for it (`ios:keep-screen-on`, `true` /
//! `false`). A whole-library download only runs while Psysonic is open; the auto-lock would
//! suspend the app and stop it. The flag only acts while the app is in front.

use objc2::runtime::{AnyObject, Bool};
use objc2::{class, msg_send};
use tauri::{AppHandle, Listener};

pub(crate) fn listen(app: &AppHandle) {
    let handle = app.clone();
    app.listen_any("ios:keep-screen-on", move |event| {
        let keep_on = event.payload().trim() == "true";
        let _ = handle.run_on_main_thread(move || {
            // SAFETY: UIApplication is used on the main thread.
            unsafe {
                let application: *mut AnyObject =
                    msg_send![class!(UIApplication), sharedApplication];
                if !application.is_null() {
                    let () = msg_send![application, setIdleTimerDisabled: Bool::new(keep_on)];
                }
            }
        });
    });
}
