//! Scene configuration for the app delegate. tao 0.35 answers
//! `application:configurationForConnectingSceneSession:options:` with a configuration it
//! releases before returning it, so UIKit messages a freed object and the app crashes at
//! launch (fixed in later tao versions). This replaces that answer, after tao has declared
//! its `AppDelegate` and before `UIApplicationMain` runs.
//!
//! It also lets the car start the app. tao starts its event loop (and with it Tauri, the
//! window and the web layer) only from its own scene delegate, which only the phone scene
//! has; a car-only start never ran Psysonic. The CarPlay scene now hands its connection to
//! tao too. tao 0.35 then puts the new window on the first connected scene, which is the
//! CarPlay scene and cannot hold windows; such a window is set aside here and joins the
//! phone scene once that connects (tao 0.37 does the same itself).

use std::cell::RefCell;
use std::ptr::NonNull;
use std::sync::OnceLock;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Bool, Imp, Sel};
use objc2::{class, ffi, msg_send, sel};
use objc2_foundation::{NSNotification, NSNotificationCenter, NSString};

#[link(name = "UIKit", kind = "framework")]
unsafe extern "C" {
    static UISceneWillConnectNotification: &'static NSString;
}

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

type SetWindowSceneFn = unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject);

/// UIKit's own `-[UIWindow setWindowScene:]`.
static UIKIT_SET_WINDOW_SCENE: OnceLock<SetWindowSceneFn> = OnceLock::new();

thread_local! {
    /// Windows tao tried to put on a scene that cannot hold windows (the CarPlay scene).
    static PARKED_WINDOWS: RefCell<Vec<Retained<AnyObject>>> = const { RefCell::new(Vec::new()) };
}

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
    guard_window_scenes();
}

/// The CarPlay scene connects: hand it to tao's scene delegate as well. tao starts the app
/// on the first scene that connects and ignores later ones that are not window scenes, so
/// with the phone already running this changes nothing.
pub(crate) fn start_app_from_car(scene: &AnyObject, session: &AnyObject, options: &AnyObject) {
    let Some(scene_delegate) = AnyClass::get(c"TaoSceneDelegate") else {
        crate::app_eprintln!(
            "[ios-scene] TaoSceneDelegate is not registered; car cannot start the app"
        );
        return;
    };
    crate::app_eprintln!("[ios-scene] car scene connects; starting the app from it");
    // SAFETY: main thread (UIKit scene callback). tao's method reads only its arguments, so
    // a fresh delegate object is enough; it is released when it goes out of scope.
    unsafe {
        let delegate: Retained<AnyObject> = msg_send![scene_delegate, new];
        let () =
            msg_send![&*delegate, scene: scene, willConnectToSession: session, options: options];
    }
}

/// Replaces `-[UIWindow setWindowScene:]` so a window is never put on a scene that cannot
/// hold one, and attaches set-aside windows to the next window scene that connects.
fn guard_window_scenes() {
    let selector = sel!(setWindowScene:);
    // SAFETY: UIKit declares `setWindowScene:` on UIWindow with one object argument and no
    // return value; only its implementation is swapped, the original is kept and called.
    unsafe {
        let method = ffi::class_getInstanceMethod(class!(UIWindow), selector);
        if method.is_null() {
            crate::app_eprintln!("[ios-scene] UIWindow has no setWindowScene:");
            return;
        }
        let answer: SetWindowSceneFn = set_window_scene;
        let previous = ffi::method_setImplementation(method, std::mem::transmute::<_, Imp>(answer));
        match previous {
            Some(previous) => {
                let _ = UIKIT_SET_WINDOW_SCENE
                    .set(std::mem::transmute::<Imp, SetWindowSceneFn>(previous));
            }
            None => return,
        }
    }

    let on_connect: RcBlock<dyn Fn(NonNull<NSNotification>)> =
        RcBlock::new(|note: NonNull<NSNotification>| {
            // SAFETY: the notification centre hands us a live notification for the call.
            let scene = unsafe { note.as_ref() }.object();
            let Some(scene) = scene else { return };
            let scene_ptr = Retained::as_ptr(&scene) as *mut AnyObject;
            if !is_window_scene(scene_ptr) {
                return;
            }
            let parked = PARKED_WINDOWS.with(|windows| std::mem::take(&mut *windows.borrow_mut()));
            let Some(original) = UIKIT_SET_WINDOW_SCENE.get() else {
                return;
            };
            for window in parked {
                crate::app_eprintln!(
                    "[ios-scene] phone scene connected; attaching the window set aside"
                );
                let window_ptr = Retained::as_ptr(&window) as *mut AnyObject;
                // SAFETY: main thread (scene notification); a live window and window scene.
                unsafe {
                    original(window_ptr, sel!(setWindowScene:), scene_ptr);
                    let () = msg_send![window_ptr, makeKeyAndVisible];
                }
            }
        });
    // SAFETY: plain Foundation call; the observer lives as long as the app.
    unsafe {
        let center = NSNotificationCenter::defaultCenter();
        let token = center.addObserverForName_object_queue_usingBlock(
            Some(UISceneWillConnectNotification),
            None,
            None,
            &on_connect,
        );
        std::mem::forget(token);
    }
}

fn is_window_scene(scene: *mut AnyObject) -> bool {
    // SAFETY: `scene` is a live object; isKindOfClass: is defined on every NSObject.
    let kind: Bool = unsafe { msg_send![scene, isKindOfClass: class!(UIWindowScene)] };
    kind.as_bool()
}

/// # Safety
/// Called by the Objective-C runtime on the main thread with a live window.
unsafe extern "C-unwind" fn set_window_scene(
    this: *mut AnyObject,
    cmd: Sel,
    scene: *mut AnyObject,
) {
    if !scene.is_null() && !is_window_scene(scene) {
        crate::app_eprintln!("[ios-scene] window would go on a scene without windows; set aside");
        // SAFETY: `this` is the live window UIKit is messaging; retained while it waits.
        if let Some(window) = unsafe { Retained::retain(this) } {
            PARKED_WINDOWS.with(|windows| windows.borrow_mut().push(window));
        }
        return;
    }
    if let Some(original) = UIKIT_SET_WINDOW_SCENE.get() {
        // SAFETY: forwards UIKit's own call unchanged.
        unsafe { original(this, cmd, scene) };
    }
}

/// The phone scene runs on tao's delegate as before, CarPlay on its own
/// (`ios::carplay`); any other role gets the system's default configuration.
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
    let is_carplay: Bool =
        msg_send![role, isEqualToString: &*NSString::from_str(crate::ios::carplay::ROLE_CARPLAY)];
    if is_carplay.as_bool() {
        // A car-only start asks for no phone scene, but the CarPlay scene hands its
        // connection to TaoSceneDelegate (`start_app_from_car`), so it must exist.
        ensure_tao_scene_delegate(this, cmd, application, session, options);
        let config: *mut AnyObject = msg_send![
            class!(UISceneConfiguration),
            configurationWithName: &*NSString::from_str("CarPlay"),
            sessionRole: role
        ];
        let () = msg_send![config, setSceneClass: class!(CPTemplateApplicationScene)];
        let () = msg_send![config, setDelegateClass: crate::ios::carplay::delegate_class()];
        return config;
    }
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

    ensure_tao_scene_delegate(this, cmd, application, session, options);
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

/// # Safety
/// Same arguments as UIKit's scene configuration call, on the main thread.
unsafe fn ensure_tao_scene_delegate(
    this: *mut AnyObject,
    cmd: Sel,
    application: *mut AnyObject,
    session: *mut AnyObject,
    options: *mut AnyObject,
) {
    if AnyClass::get(c"TaoSceneDelegate").is_none() {
        if let Some(tao) = TAO_IMPLEMENTATION.get() {
            // Registers TaoSceneDelegate; the returned pointer is dangling and ignored.
            let _ = tao(this, cmd, application, session, options);
        }
    }
}
