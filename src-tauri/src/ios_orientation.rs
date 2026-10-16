//! iPhone: upright everywhere except the full-screen player. The web layer sends
//! `ios:allow-landscape` (`true` / `false`); the window's root view controller
//! (tao's) then allows landscape or turns the interface back upright. The iPad
//! keeps every orientation.

use objc2::runtime::{AnyObject, Bool};
use objc2::{class, msg_send, sel};
use tauri::{AppHandle, Listener, Manager};

/// `UIInterfaceOrientationMaskPortrait`.
const MASK_PORTRAIT: usize = 1 << 1;
/// Portrait plus both landscape sides (`…MaskAllButUpsideDown`).
const MASK_PORTRAIT_AND_LANDSCAPE: usize = (1 << 1) | (1 << 3) | (1 << 4);
/// `UIUserInterfaceIdiomPad`.
const IDIOM_PAD: isize = 1;

pub(crate) fn listen(app: &AppHandle) {
    let handle = app.clone();
    app.listen_any("ios:allow-landscape", move |event| {
        let allow_landscape = event.payload().trim() == "true";
        for window in handle.webview_windows().into_values() {
            let _ = window.with_webview(move |webview| {
                // SAFETY: with_webview runs on the main thread, and the pointer is the
                // window's live root view controller.
                unsafe { apply(webview.view_controller().cast(), allow_landscape) };
            });
        }
    });
}

/// # Safety
/// `controller` is null or tao's root view controller, and this runs on the main thread.
unsafe fn apply(controller: *mut AnyObject, allow_landscape: bool) {
    if controller.is_null() {
        return;
    }
    let device: *mut AnyObject = msg_send![class!(UIDevice), currentDevice];
    let idiom: isize = msg_send![device, userInterfaceIdiom];
    if idiom == IDIOM_PAD {
        return;
    }
    let mask = if allow_landscape {
        MASK_PORTRAIT_AND_LANDSCAPE
    } else {
        MASK_PORTRAIT
    };
    // tao keeps the mask and answers -supportedInterfaceOrientations with it (and calls
    // the pre-iOS-16 attemptRotationToDeviceOrientation).
    let () = msg_send![controller, setSupportedInterfaceOrientations: mask];
    // iOS 16+ re-reads the mask only on request, and then turns an interface whose
    // orientation is no longer allowed back upright.
    let can_update: Bool = msg_send![
        controller,
        respondsToSelector: sel!(setNeedsUpdateOfSupportedInterfaceOrientations)
    ];
    if can_update.as_bool() {
        let () = msg_send![controller, setNeedsUpdateOfSupportedInterfaceOrientations];
    }
}
