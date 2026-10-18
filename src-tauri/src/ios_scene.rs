//! Scene configuration for the app delegate. tao 0.35 answers
//! `application:configurationForConnectingSceneSession:options:` with a configuration it
//! releases before returning it, so UIKit messages a freed object and the app crashes at
//! launch (fixed in later tao versions). This replaces that answer, after tao has declared
//! its `AppDelegate` and before `UIApplicationMain` runs.

use std::sync::OnceLock;

use objc2::runtime::{AnyClass, AnyObject, Bool, Imp, Sel};
use objc2::{class, ffi, msg_send, sel};
use objc2_foundation::NSString;

/// The phone scene's session role (`UIWindowSceneSessionRoleApplication`).
const ROLE_APPLICATION: &str = "UIWindowSceneSessionRoleApplication";

type ConfigurationFn = unsafe extern "C-unwind" fn(
    *mut AnyObject,
    Sel,
    *mut AnyObject,
    *mut AnyObject,
    *mut AnyObject,
) -> *mut AnyObject;

/// tao's own implementation. Calling it is the only way to get `TaoSceneDelegate`
/// registered with the runtime (it registers on first use); its return value is
/// already freed and must never be touched.
static TAO_IMPLEMENTATION: OnceLock<ConfigurationFn> = OnceLock::new();

/// Call after the Tauri app is built (tao declares `AppDelegate` while creating its event
/// loop) and before it runs.
pub(crate) fn install() {
    let Some(delegate) = AnyClass::get(c"AppDelegate") else {
        crate::app_eprintln!(
            "[ios-scene] AppDelegate not declared; scene configuration left to tao"
        );
        return;
    };
    let selector = sel!(application:configurationForConnectingSceneSession:options:);
    // SAFETY: tao declared the method with exactly this signature (three object arguments,
    // object return); only its implementation is swapped.
    unsafe {
        let method = ffi::class_getInstanceMethod(delegate, selector);
        if method.is_null() {
            crate::app_eprintln!("[ios-scene] AppDelegate has no scene configuration method");
            return;
        }
        let answer: ConfigurationFn = configuration_for_connecting_scene_session;
        let previous = ffi::method_setImplementation(method, std::mem::transmute::<_, Imp>(answer));
        if let Some(previous) = previous {
            let _ = TAO_IMPLEMENTATION.set(std::mem::transmute::<Imp, ConfigurationFn>(previous));
        }
    }
}

/// The phone scene runs on tao's delegate as before; any other role gets the system's
/// default configuration.
///
/// # Safety
/// Called by UIKit on the main thread with a live scene session.
unsafe extern "C-unwind" fn configuration_for_connecting_scene_session(
    this: *mut AnyObject,
    cmd: Sel,
    application: *mut AnyObject,
    session: *mut AnyObject,
    options: *mut AnyObject,
) -> *mut AnyObject {
    let role: *mut NSString = msg_send![session, role];
    let is_application: Bool =
        msg_send![role, isEqualToString: &*NSString::from_str(ROLE_APPLICATION)];
    if !is_application.as_bool() {
        let config: *mut AnyObject = msg_send![
            class!(UISceneConfiguration),
            configurationWithName: std::ptr::null::<NSString>(),
            sessionRole: role
        ];
        return config;
    }

    if AnyClass::get(c"TaoSceneDelegate").is_none() {
        if let Some(tao) = TAO_IMPLEMENTATION.get() {
            // Registers TaoSceneDelegate; the returned pointer is dangling and ignored.
            let _ = tao(this, cmd, application, session, options);
        }
    }
    let Some(scene_delegate) = AnyClass::get(c"TaoSceneDelegate") else {
        crate::app_eprintln!("[ios-scene] TaoSceneDelegate is not registered");
        return std::ptr::null_mut();
    };
    // Autoreleased (+0): UIKit retains what it keeps, so the object outlives this call.
    let config: *mut AnyObject = msg_send![
        class!(UISceneConfiguration),
        configurationWithName: &*NSString::from_str("TaoScene"),
        sessionRole: role
    ];
    let () = msg_send![config, setDelegateClass: scene_delegate];
    config
}
