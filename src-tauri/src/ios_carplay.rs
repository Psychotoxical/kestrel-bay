//! CarPlay scene. CarPlay shows Apple's templates, not the web layer: on connect the car
//! gets a list with a "Now Playing" entry. Playback, the now-playing card and the car's
//! buttons already run through MPNowPlayingInfoCenter / MPRemoteCommandCenter, which the
//! CarPlay now-playing template reads. tao is left out entirely; the phone scene starts
//! exactly as before.

use std::cell::RefCell;
use std::ptr::NonNull;

use block2::{Block, RcBlock};
use objc2::rc::{Allocated, Retained};
use objc2::runtime::{AnyClass, AnyObject, Bool, NSObject};
use objc2::{class, define_class, ffi, msg_send, ClassType, MainThreadOnly};
use objc2_foundation::NSString;

/// Session role of a CarPlay scene (`CPTemplateApplicationSceneSessionRoleApplication`).
pub(crate) const ROLE_CARPLAY: &str = "CPTemplateApplicationSceneSessionRoleApplication";

thread_local! {
    /// The connected car's interface controller; CarPlay only keeps it while we do.
    static INTERFACE_CONTROLLER: RefCell<Option<Retained<AnyObject>>> = const { RefCell::new(None) };
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "PsysonicCarPlaySceneDelegate"]
    struct CarPlaySceneDelegate;

    impl CarPlaySceneDelegate {
        #[unsafe(method(templateApplicationScene:didConnectInterfaceController:))]
        fn did_connect(&self, _scene: &AnyObject, controller: &AnyObject) {
            crate::app_eprintln!("[carplay] connected");
            // SAFETY: main thread (UIKit callback), controller is a live CPInterfaceController.
            unsafe { show_root(controller) };
            let retained = unsafe { Retained::retain(controller as *const AnyObject as *mut AnyObject) };
            INTERFACE_CONTROLLER.with(|slot| *slot.borrow_mut() = retained);
        }

        #[unsafe(method(templateApplicationScene:didDisconnectInterfaceController:))]
        fn did_disconnect(&self, _scene: &AnyObject, _controller: &AnyObject) {
            crate::app_eprintln!("[carplay] disconnected");
            INTERFACE_CONTROLLER.with(|slot| slot.borrow_mut().take());
        }
    }
);

/// The scene delegate class for the CarPlay scene configuration; registers it (and its
/// protocol conformance, which CarPlay may check) on first use.
pub(crate) fn delegate_class() -> &'static AnyClass {
    let class = CarPlaySceneDelegate::class();
    for protocol in [c"UISceneDelegate", c"CPTemplateApplicationSceneDelegate"] {
        // SAFETY: plain runtime lookups; adding an already present protocol is a no-op.
        unsafe {
            let protocol = ffi::objc_getProtocol(protocol.as_ptr());
            if !protocol.is_null() {
                ffi::class_addProtocol(class as *const AnyClass as *mut AnyClass, protocol);
            }
        }
    }
    class
}

/// Root template: one list with a "Now Playing" row that opens CarPlay's now-playing
/// screen.
///
/// # Safety
/// Main thread; `controller` is a live CPInterfaceController.
unsafe fn show_root(controller: &AnyObject) {
    let item: Allocated<AnyObject> = msg_send![class!(CPListItem), alloc];
    let item: Retained<AnyObject> = msg_send![
        item,
        initWithText: &*NSString::from_str("Now Playing"),
        detailText: std::ptr::null::<NSString>()
    ];
    let on_select: RcBlock<dyn Fn(NonNull<AnyObject>, NonNull<Block<dyn Fn()>>)> = RcBlock::new(
        |_item: NonNull<AnyObject>, done: NonNull<Block<dyn Fn()>>| {
            INTERFACE_CONTROLLER.with(|slot| {
                if let Some(controller) = slot.borrow().as_ref() {
                    // SAFETY: main thread (CarPlay calls list handlers there).
                    unsafe { push_now_playing(controller) };
                }
            });
            // SAFETY: CarPlay hands a valid completion block that must be called once.
            unsafe { done.as_ref().call(()) };
        },
    );
    let () = msg_send![&*item, setHandler: &*on_select];

    let items: *mut AnyObject = msg_send![class!(NSArray), arrayWithObject: &*item];
    let section: Allocated<AnyObject> = msg_send![class!(CPListSection), alloc];
    let section: Retained<AnyObject> = msg_send![section, initWithItems: items];
    let sections: *mut AnyObject = msg_send![class!(NSArray), arrayWithObject: &*section];
    let list: Allocated<AnyObject> = msg_send![class!(CPListTemplate), alloc];
    let list: Retained<AnyObject> = msg_send![
        list,
        initWithTitle: &*NSString::from_str("Psysonic"),
        sections: sections
    ];
    let () = msg_send![
        controller,
        setRootTemplate: &*list,
        animated: Bool::NO,
        completion: std::ptr::null::<Block<dyn Fn(Bool, *mut AnyObject)>>()
    ];
}

/// # Safety
/// Main thread; `controller` is a live CPInterfaceController.
unsafe fn push_now_playing(controller: &AnyObject) {
    let now_playing: *mut AnyObject = msg_send![class!(CPNowPlayingTemplate), sharedTemplate];
    let () = msg_send![
        controller,
        pushTemplate: now_playing,
        animated: Bool::YES,
        completion: std::ptr::null::<Block<dyn Fn(Bool, *mut AnyObject)>>()
    ];
}
