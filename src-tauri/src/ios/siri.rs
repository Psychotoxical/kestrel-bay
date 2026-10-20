//! Siri: "play X in Psysonic" (and the assistant cell in CarPlay). The intent is handled
//! in the app itself, without an Intents extension (iOS 14+): UIKit asks the app delegate
//! for a handler (`application:handlerForIntent:`, only called for apps with multiple
//! scenes, which the CarPlay setup turns on) and the intents the app supports are listed
//! in `Info.ios.plist` (`INIntentsSupported`).
//!
//! The handler does no searching. It passes what Siri understood to the web layer
//! (`siri:play`), which searches the library and plays; Siri is answered with success
//! right away. A request that arrives before the web layer listens (cold start from the
//! car) waits here and is sent when it reports `siri:ready`.

use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

use block2::Block;
use objc2::rc::{Allocated, Retained};
use objc2::runtime::{AnyClass, AnyObject, Bool, NSObject, Sel};
use objc2::{class, define_class, ffi, msg_send, sel, AnyThread, ClassType};
use objc2_foundation::NSString;
use tauri::{AppHandle, Emitter, Listener};

/// `INPlayMediaIntentResponseCodeSuccess` (Intents SDK, `INPlayMediaIntentResponse.h`).
const RESPONSE_SUCCESS: isize = 4;
/// `INVocabularyStringTypeMediaMusicArtistName` (Intents SDK, `INVocabulary.h`).
const VOCABULARY_MUSIC_ARTIST: isize = 701;

static APP: OnceLock<AppHandle> = OnceLock::new();
static WEB_READY: AtomicBool = AtomicBool::new(false);
static WAITING: Mutex<Vec<PlayRequest>> = Mutex::new(Vec::new());

thread_local! {
    /// The one handler object, created on first use (UIKit asks on the main queue).
    static HANDLER: RefCell<Option<Retained<MediaIntentHandler>>> = const { RefCell::new(None) };
}

/// What Siri understood. `media_type` is `INMediaItemType`: 1 song, 2 album, 3 artist,
/// 4 genre, 5 playlist, 0 unknown.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct PlayRequest {
    media_name: Option<String>,
    media_type: isize,
    artist_name: Option<String>,
    album_name: Option<String>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[name = "PsysonicMediaIntentHandler"]
    struct MediaIntentHandler;

    impl MediaIntentHandler {
        #[unsafe(method(handlePlayMedia:completion:))]
        fn handle_play_media(&self, intent: &AnyObject, completion: &Block<dyn Fn(*mut AnyObject)>) {
            let request = unsafe { request_from(intent) };
            crate::app_eprintln!(
                "[siri] play request: type={} name={:?} artist={:?} album={:?}",
                request.media_type,
                request.media_name,
                request.artist_name,
                request.album_name
            );
            deliver(request);
            // SAFETY: plain Objective-C allocation of the response class (the Intents
            // framework is linked); the completion block takes the response object.
            unsafe {
                let response: Allocated<AnyObject> =
                    msg_send![class!(INPlayMediaIntentResponse), alloc];
                let response: Retained<AnyObject> = msg_send![
                    response,
                    initWithCode: RESPONSE_SUCCESS,
                    userActivity: std::ptr::null::<AnyObject>()
                ];
                completion.call((Retained::as_ptr(&response) as *mut AnyObject,));
            }
        }
    }
);

/// # Safety
/// `intent` is a live `INPlayMediaIntent`.
unsafe fn request_from(intent: &AnyObject) -> PlayRequest {
    let search: *mut AnyObject = msg_send![intent, mediaSearch];
    if search.is_null() {
        return PlayRequest {
            media_name: None,
            media_type: 0,
            artist_name: None,
            album_name: None,
        };
    }
    let media_type: isize = msg_send![search, mediaType];
    PlayRequest {
        media_name: text(msg_send![search, mediaName]),
        media_type,
        artist_name: text(msg_send![search, artistName]),
        album_name: text(msg_send![search, albumName]),
    }
}

/// # Safety
/// `value` is null or a live NSString.
unsafe fn text(value: *mut NSString) -> Option<String> {
    if value.is_null() {
        return None;
    }
    let text = (*value).to_string();
    (!text.trim().is_empty()).then_some(text)
}

fn deliver(request: PlayRequest) {
    if WEB_READY.load(Ordering::SeqCst) {
        if let Some(app) = APP.get() {
            let _ = app.emit("siri:play", request);
            return;
        }
    }
    if let Ok(mut waiting) = WAITING.lock() {
        waiting.push(request);
    }
}

/// The web layer reports `siri:ready` once it listens; requests made earlier follow.
pub(crate) fn listen(app: &AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }
    // The library's artist names, so Siri hears "Motorjesus" instead of a name it knows.
    let vocabulary = app.clone();
    app.listen_any("siri:vocabulary", move |event| {
        let Ok(names) = serde_json::from_str::<Vec<String>>(event.payload()) else {
            return;
        };
        let _ = vocabulary.run_on_main_thread(move || {
            // SAFETY: main thread; INVocabulary is the shared per-app vocabulary.
            unsafe { set_artist_vocabulary(&names) };
        });
    });

    let ready = app.clone();
    app.listen_any("siri:ready", move |_| {
        WEB_READY.store(true, Ordering::SeqCst);
        let waiting = WAITING
            .lock()
            .map(|mut waiting| std::mem::take(&mut *waiting))
            .unwrap_or_default();
        for request in waiting {
            let _ = ready.emit("siri:play", request);
        }
    });
}

/// UIKit's question: who handles this intent? Only play requests get the handler.
///
/// # Safety
/// Called by UIKit on the main queue.
unsafe extern "C-unwind" fn handler_for_intent(
    _this: *mut AnyObject,
    _cmd: Sel,
    _application: *mut AnyObject,
    intent: *mut AnyObject,
) -> *mut AnyObject {
    if intent.is_null() {
        return std::ptr::null_mut();
    }
    let is_play: Bool = msg_send![intent, isKindOfClass: class!(INPlayMediaIntent)];
    if !is_play.as_bool() {
        return std::ptr::null_mut();
    }
    HANDLER.with(|slot| {
        let mut slot = slot.borrow_mut();
        if slot.is_none() {
            let class = MediaIntentHandler::class();
            let protocol = ffi::objc_getProtocol(c"INPlayMediaIntentHandling".as_ptr());
            if !protocol.is_null() {
                ffi::class_addProtocol(class as *const AnyClass as *mut AnyClass, protocol);
            }
            let handler: Retained<MediaIntentHandler> =
                msg_send![MediaIntentHandler::alloc(), init];
            *slot = Some(handler);
        }
        // Kept alive by the slot; UIKit retains what it keeps.
        slot.as_ref().map_or(std::ptr::null_mut(), |handler| {
            Retained::as_ptr(handler) as *mut AnyObject
        })
    })
}

/// Teaches tao's `AppDelegate` the handler question. Call after the Tauri app is built
/// (tao declares the delegate then) and before it runs, next to `ios::scene::install`.
pub(crate) fn install() {
    let Some(delegate) = AnyClass::get(c"AppDelegate") else {
        crate::app_eprintln!("[siri] AppDelegate not declared; Siri requests are not handled");
        return;
    };
    // Object return, then self, _cmd, UIApplication, INIntent.
    let added = unsafe {
        ffi::class_addMethod(
            delegate as *const AnyClass as *mut AnyClass,
            sel!(application:handlerForIntent:),
            std::mem::transmute::<
                unsafe extern "C-unwind" fn(
                    *mut AnyObject,
                    Sel,
                    *mut AnyObject,
                    *mut AnyObject,
                ) -> *mut AnyObject,
                objc2::runtime::Imp,
            >(handler_for_intent),
            c"@@:@@".as_ptr(),
        )
    };
    if !added.as_bool() {
        crate::app_eprintln!("[siri] AppDelegate already answers application:handlerForIntent:");
    }
}

/// Hands the artist names to Siri's speech recognition for this app.
///
/// # Safety
/// Main thread.
unsafe fn set_artist_vocabulary(names: &[String]) {
    let array: Allocated<AnyObject> = msg_send![class!(NSMutableArray), alloc];
    let array: Retained<AnyObject> = msg_send![array, init];
    for name in names {
        let text = NSString::from_str(name);
        let () = msg_send![&*array, addObject: &*text];
    }
    let set: *mut AnyObject = msg_send![class!(NSOrderedSet), orderedSetWithArray: &*array];
    let vocabulary: *mut AnyObject = msg_send![class!(INVocabulary), sharedVocabulary];
    if set.is_null() || vocabulary.is_null() {
        return;
    }
    let () = msg_send![vocabulary, setVocabularyStrings: set, ofType: VOCABULARY_MUSIC_ARTIST];
    crate::app_eprintln!("[siri] vocabulary: {} artist names", names.len());
}
