//! CarPlay scene. CarPlay shows Apple's templates, not the web layer, but the web layer
//! owns the content: every list is requested from it (`carplay:list`) and answered
//! with `carplay:list-result`, so the lists use the same local-first library helpers,
//! scopes and translations as the phone pages. Tapping a playable row asks the web
//! layer to play it (`carplay:play`) and opens CarPlay's now-playing screen, which
//! reads MPNowPlayingInfoCenter / MPRemoteCommandCenter like the lock screen does.
//!
//! Rows carry the path of their cover on disk; covers the web layer still has to
//! download follow as `carplay:list-images`. The now-playing screen gets up-next and
//! album/artist buttons (lists `queue` / `current`) and our shuffle, repeat and heart
//! buttons, which send `carplay:command` and redraw from `carplay:state`.
//!
//! On a cold start from the car the web layer may not listen yet: requests wait here
//! and are sent again when it reports `carplay:ready`. tao is left out entirely; the
//! phone scene starts exactly as before.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::ptr::NonNull;
use std::sync::OnceLock;

use block2::{Block, RcBlock};
use objc2::rc::{Allocated, Retained};
use objc2::runtime::{AnyClass, AnyObject, Bool, NSObject};
use objc2::{class, define_class, ffi, msg_send, ClassType, MainThreadMarker, MainThreadOnly};
use objc2_foundation::NSString;
use tauri::{AppHandle, Emitter, Listener};

/// Session role of a CarPlay scene (`CPTemplateApplicationSceneSessionRoleApplication`).
pub(crate) const ROLE_CARPLAY: &str = "CPTemplateApplicationSceneSessionRoleApplication";

/// The list the web layer answers with the tab bar's tabs.
const NODE_TABS: &str = "tabs";
/// `CPListItemAccessoryTypeDisclosureIndicator`.
const ACCESSORY_DISCLOSURE: isize = 1;
/// SF Symbols per tab, in the order the web layer sends the tabs.
const TAB_SYMBOLS: [&str; 4] = [
    "house.fill",
    "music.note.list",
    "square.stack.fill",
    "arrow.down.circle.fill",
];

/// Lists whose rows are kept for covers that arrive later; older ones are dropped.
const MAX_SHOWN_LISTS: usize = 48;
/// `MPShuffleTypeOff` / `MPShuffleTypeItems`.
const SHUFFLE_OFF: isize = 0;
const SHUFFLE_ITEMS: isize = 1;
/// `MPRepeatTypeOff` / `MPRepeatTypeOne` / `MPRepeatTypeAll`.
const REPEAT_OFF: isize = 0;
const REPEAT_ONE: isize = 1;
const REPEAT_ALL: isize = 2;
/// `MPRemoteCommandHandlerStatusSuccess` (MediaPlayer SDK, `MPRemoteCommand.h`).
const COMMAND_SUCCESS: isize = 0;

static APP: OnceLock<AppHandle> = OnceLock::new();

thread_local! {
    /// The connected car's interface controller; CarPlay only keeps it while we do.
    static INTERFACE_CONTROLLER: RefCell<Option<Retained<AnyObject>>> = const { RefCell::new(None) };
    /// Lists waiting for the web layer: request id → (node, template to fill).
    static PENDING: RefCell<HashMap<u64, (String, Retained<AnyObject>)>> = RefCell::new(HashMap::new());
    static NEXT_REQUEST: Cell<u64> = const { Cell::new(1) };
    /// Rows of answered lists by request id, so late covers find their row.
    static SHOWN: RefCell<HashMap<u64, Vec<Vec<Retained<AnyObject>>>>> = RefCell::new(HashMap::new());
    /// What the now-playing buttons show, as last reported by the web layer.
    static STATE: RefCell<NowPlayingState> = RefCell::new(NowPlayingState::default());
    /// Observer for the now-playing template's up-next and album/artist buttons.
    static NOW_PLAYING_OBSERVER: RefCell<Option<Retained<NowPlayingObserver>>> = const { RefCell::new(None) };
    /// The shuffle / repeat remote commands are enabled and have their target (done once).
    static MODE_COMMANDS_READY: Cell<bool> = const { Cell::new(false) };
    /// The heart state the now-playing buttons were last built with; rebuilding them on every
    /// shuffle / repeat change made the buttons flash twice.
    static BUTTONS_STARRED: Cell<Option<bool>> = const { Cell::new(None) };
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ListRequest {
    request_id: u64,
    node: String,
}

#[derive(Clone, serde::Serialize)]
struct PlayRequest {
    node: String,
}

#[derive(Clone, serde::Serialize)]
struct CommandRequest {
    action: &'static str,
}

#[derive(Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NowPlayingState {
    shuffle: bool,
    /// `off` / `all` / `one`.
    repeat: String,
    starred: bool,
    up_next_title: String,
    album_title: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageUpdates {
    request_id: u64,
    images: Vec<ImageUpdate>,
}

#[derive(serde::Deserialize)]
struct ImageUpdate {
    section: usize,
    row: usize,
    image: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListResult {
    request_id: u64,
    #[serde(default)]
    sections: Vec<Section>,
    /// Shown when the list is empty (nothing downloaded, offline, …).
    empty_text: Option<String>,
}

#[derive(serde::Deserialize)]
struct Section {
    header: Option<String>,
    items: Vec<Item>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct Item {
    /// What a tap opens (`browse`) or plays: an opaque id the web layer understands.
    node: String,
    title: String,
    subtitle: Option<String>,
    browse: bool,
    /// Absolute path of the cover on disk.
    image: Option<String>,
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
            if let Some(app) = APP.get() {
                crate::ios_audio_session::retry_activation(app);
            }
            let retained =
                unsafe { Retained::retain(controller as *const AnyObject as *mut AnyObject) };
            INTERFACE_CONTROLLER.with(|slot| *slot.borrow_mut() = retained);
            // SAFETY: main thread (UIKit callback), controller is a live CPInterfaceController.
            unsafe {
                setup_now_playing();
                show_loading_root(controller);
            }
        }

        #[unsafe(method(templateApplicationScene:didDisconnectInterfaceController:))]
        fn did_disconnect(&self, _scene: &AnyObject, _controller: &AnyObject) {
            crate::app_eprintln!("[carplay] disconnected");
            INTERFACE_CONTROLLER.with(|slot| slot.borrow_mut().take());
            PENDING.with(|pending| pending.borrow_mut().clear());
            SHOWN.with(|shown| shown.borrow_mut().clear());
        }
    }
);

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "PsysonicCarPlayNowPlayingObserver"]
    struct NowPlayingObserver;

    impl NowPlayingObserver {
        #[unsafe(method(nowPlayingTemplateUpNextButtonTapped:))]
        fn up_next_tapped(&self, _template: &AnyObject) {
            let title = STATE.with(|state| state.borrow().up_next_title.clone());
            // SAFETY: CarPlay calls template observers on the main thread.
            unsafe { open_list("queue", &title) };
        }

        #[unsafe(method(nowPlayingTemplateAlbumArtistButtonTapped:))]
        fn album_artist_tapped(&self, _template: &AnyObject) {
            let title = STATE.with(|state| state.borrow().album_title.clone());
            // SAFETY: as above.
            unsafe { open_list("current", &title) };
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

/// Hooks the web layer up: its answers fill the lists, and `carplay:ready` (sent when it
/// starts listening) flushes the requests made before it was there.
pub(crate) fn listen(app: &AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }
    let results = app.clone();
    app.listen_any("carplay:list-result", move |event| {
        let result = match serde_json::from_str::<ListResult>(event.payload()) {
            Ok(result) => result,
            Err(error) => {
                crate::app_eprintln!("[carplay] unreadable list result: {error}");
                return;
            }
        };
        let _ = results.run_on_main_thread(move || {
            // SAFETY: main thread; templates in PENDING are live CarPlay templates.
            unsafe { apply_result(result) };
        });
    });
    let images = app.clone();
    app.listen_any("carplay:list-images", move |event| {
        let Ok(updates) = serde_json::from_str::<ImageUpdates>(event.payload()) else {
            return;
        };
        let _ = images.run_on_main_thread(move || {
            // SAFETY: main thread; rows in SHOWN are live CPListItems.
            unsafe { apply_images(updates) };
        });
    });
    let state = app.clone();
    app.listen_any("carplay:state", move |event| {
        let Ok(next) = serde_json::from_str::<NowPlayingState>(event.payload()) else {
            return;
        };
        let _ = state.run_on_main_thread(move || {
            STATE.with(|slot| *slot.borrow_mut() = next);
            if INTERFACE_CONTROLLER.with(|slot| slot.borrow().is_some()) {
                // SAFETY: main thread.
                unsafe { update_now_playing_buttons() };
            }
        });
    });
    let ready = app.clone();
    app.listen_any("carplay:ready", move |_| {
        let _ = ready.run_on_main_thread(resend_pending);
    });
    // Requests made before the app handle existed (CarPlay connected first).
    let _ = app.run_on_main_thread(resend_pending);
}

fn resend_pending() {
    let Some(app) = APP.get() else { return };
    PENDING.with(|pending| {
        for (request_id, (node, _)) in pending.borrow().iter() {
            let _ = app.emit(
                "carplay:list",
                ListRequest {
                    request_id: *request_id,
                    node: node.clone(),
                },
            );
        }
    });
}

/// Asks the web layer for `node`; the answer fills `template`.
fn request_list(node: &str, template: Retained<AnyObject>) {
    let request_id = NEXT_REQUEST.with(|next| {
        let id = next.get();
        next.set(id + 1);
        id
    });
    PENDING.with(|pending| {
        pending
            .borrow_mut()
            .insert(request_id, (node.to_string(), template))
    });
    if let Some(app) = APP.get() {
        let _ = app.emit(
            "carplay:list",
            ListRequest {
                request_id,
                node: node.to_string(),
            },
        );
    }
}

fn ns(text: &str) -> Retained<NSString> {
    NSString::from_str(text)
}

/// # Safety
/// Main thread.
unsafe fn mutable_array() -> Retained<AnyObject> {
    let array: Allocated<AnyObject> = msg_send![class!(NSMutableArray), alloc];
    msg_send![array, init]
}

/// An empty list template that says "loading" until its content arrives.
///
/// # Safety
/// Main thread.
unsafe fn loading_list(title: &str, loading_text: &str) -> Retained<AnyObject> {
    let sections = mutable_array();
    let list: Allocated<AnyObject> = msg_send![class!(CPListTemplate), alloc];
    let list: Retained<AnyObject> = msg_send![
        list,
        initWithTitle: &*ns(title),
        sections: &*sections
    ];
    set_empty_text(&list, loading_text);
    list
}

/// # Safety
/// Main thread; `list` is a CPListTemplate.
unsafe fn set_empty_text(list: &AnyObject, text: &str) {
    let variants = mutable_array();
    let () = msg_send![&*variants, addObject: &*ns(text)];
    let () = msg_send![list, setEmptyViewTitleVariants: &*variants];
}

/// Until the web layer sends the tabs, the car shows one loading list.
///
/// # Safety
/// Main thread; `controller` is a live CPInterfaceController.
unsafe fn show_loading_root(controller: &AnyObject) {
    let list = loading_list("Psysonic", "…");
    let () = msg_send![
        controller,
        setRootTemplate: &*list,
        animated: Bool::NO,
        completion: std::ptr::null::<Block<dyn Fn(Bool, *mut AnyObject)>>()
    ];
    request_list(NODE_TABS, list);
}

/// # Safety
/// Main thread; templates in PENDING are live CarPlay templates.
unsafe fn apply_result(result: ListResult) {
    let Some((node, template)) =
        PENDING.with(|pending| pending.borrow_mut().remove(&result.request_id))
    else {
        return; // superseded or disconnected
    };
    if node == NODE_TABS {
        show_tabs(&result);
        return;
    }
    let (sections, rows) = build_sections(&result.sections);
    let () = msg_send![&*template, updateSections: &*sections];
    SHOWN.with(|shown| {
        let mut shown = shown.borrow_mut();
        shown.insert(result.request_id, rows);
        while shown.len() > MAX_SHOWN_LISTS {
            let Some(oldest) = shown.keys().min().copied() else {
                break;
            };
            shown.remove(&oldest);
        }
    });
    if result
        .sections
        .iter()
        .all(|section| section.items.is_empty())
    {
        if let Some(text) = result.empty_text.as_deref() {
            set_empty_text(&template, text);
        }
    }
}

/// The tab bar: one list per tab, each filled on its own.
///
/// # Safety
/// Main thread.
unsafe fn show_tabs(result: &ListResult) {
    let Some(controller) = INTERFACE_CONTROLLER.with(|slot| slot.borrow().clone()) else {
        return;
    };
    let loading = result.empty_text.as_deref().unwrap_or("…");
    let templates = mutable_array();
    let tabs = result
        .sections
        .iter()
        .flat_map(|section| section.items.iter());
    for (index, tab) in tabs.take(TAB_SYMBOLS.len()).enumerate() {
        let list = loading_list(&tab.title, loading);
        let () = msg_send![&*list, setTabTitle: &*ns(&tab.title)];
        let image: *mut AnyObject =
            msg_send![class!(UIImage), systemImageNamed: &*ns(TAB_SYMBOLS[index])];
        if !image.is_null() {
            let () = msg_send![&*list, setTabImage: image];
        }
        let () = msg_send![&*templates, addObject: &*list];
        request_list(&tab.node, list);
    }
    let tab_bar: Allocated<AnyObject> = msg_send![class!(CPTabBarTemplate), alloc];
    let tab_bar: Retained<AnyObject> = msg_send![tab_bar, initWithTemplates: &*templates];
    let () = msg_send![
        &*controller,
        setRootTemplate: &*tab_bar,
        animated: Bool::NO,
        completion: std::ptr::null::<Block<dyn Fn(Bool, *mut AnyObject)>>()
    ];
}

/// CPListSections for the web layer's sections, cut to CarPlay's item limit.
///
/// # Safety
/// Main thread.
unsafe fn build_sections(
    sections: &[Section],
) -> (Retained<AnyObject>, Vec<Vec<Retained<AnyObject>>>) {
    let max_items: usize = msg_send![class!(CPListTemplate), maximumItemCount];
    let max_sections: usize = msg_send![class!(CPListTemplate), maximumSectionCount];
    let mut budget = max_items;
    let out = mutable_array();
    let mut kept = Vec::new();
    for section in sections.iter().take(max_sections) {
        if budget == 0 {
            break;
        }
        let items = mutable_array();
        let mut section_rows = Vec::new();
        for item in section.items.iter().take(budget) {
            let row = list_item(item);
            let () = msg_send![&*items, addObject: &*row];
            section_rows.push(row);
        }
        kept.push(section_rows);
        budget = budget.saturating_sub(section.items.len());
        let header = section.header.as_deref().map(ns);
        let header_ptr: *const NSString = header
            .as_deref()
            .map_or(std::ptr::null(), |h| h as *const NSString);
        let list_section: Allocated<AnyObject> = msg_send![class!(CPListSection), alloc];
        let list_section: Retained<AnyObject> = msg_send![
            list_section,
            initWithItems: &*items,
            header: header_ptr,
            sectionIndexTitle: std::ptr::null::<NSString>()
        ];
        let () = msg_send![&*out, addObject: &*list_section];
    }
    (out, kept)
}

/// # Safety
/// Main thread; `row` is a CPListItem.
unsafe fn set_row_image(row: &AnyObject, path: &str) {
    let image: *mut AnyObject = msg_send![class!(UIImage), imageWithContentsOfFile: &*ns(path)];
    if !image.is_null() {
        let () = msg_send![row, setImage: image];
    }
}

/// Covers downloaded after their list was shown.
///
/// # Safety
/// Main thread; rows in SHOWN are live CPListItems.
unsafe fn apply_images(updates: ImageUpdates) {
    SHOWN.with(|shown| {
        let shown = shown.borrow();
        let Some(rows) = shown.get(&updates.request_id) else {
            return;
        };
        for update in &updates.images {
            if let Some(row) = rows
                .get(update.section)
                .and_then(|section| section.get(update.row))
            {
                set_row_image(row, &update.image);
            }
        }
    });
}

/// # Safety
/// Main thread.
unsafe fn list_item(item: &Item) -> Retained<AnyObject> {
    let subtitle = item.subtitle.as_deref().map(ns);
    let subtitle_ptr: *const NSString = subtitle
        .as_deref()
        .map_or(std::ptr::null(), |s| s as *const NSString);
    let row: Allocated<AnyObject> = msg_send![class!(CPListItem), alloc];
    let row: Retained<AnyObject> = msg_send![
        row,
        initWithText: &*ns(&item.title),
        detailText: subtitle_ptr
    ];
    if item.browse {
        let () = msg_send![&*row, setAccessoryType: ACCESSORY_DISCLOSURE];
    }
    if let Some(path) = item.image.as_deref() {
        set_row_image(&row, path);
    }
    let node = item.node.clone();
    let title = item.title.clone();
    let browse = item.browse;
    let on_select: RcBlock<dyn Fn(NonNull<AnyObject>, NonNull<Block<dyn Fn()>>)> = RcBlock::new(
        move |_row: NonNull<AnyObject>, done: NonNull<Block<dyn Fn()>>| {
            // SAFETY: CarPlay calls list handlers on the main thread.
            unsafe {
                if browse {
                    open_list(&node, &title);
                } else {
                    play(&node);
                }
                // CarPlay hands a valid completion block that must be called once.
                done.as_ref().call(());
            }
        },
    );
    let () = msg_send![&*row, setHandler: &*on_select];
    row
}

/// # Safety
/// Main thread.
unsafe fn open_list(node: &str, title: &str) {
    crate::app_eprintln!("[carplay] open {node}");
    let Some(controller) = INTERFACE_CONTROLLER.with(|slot| slot.borrow().clone()) else {
        return;
    };
    let list = loading_list(title, "…");
    let () = msg_send![
        &*controller,
        pushTemplate: &*list,
        animated: Bool::YES,
        completion: std::ptr::null::<Block<dyn Fn(Bool, *mut AnyObject)>>()
    ];
    request_list(node, list);
}

/// # Safety
/// Main thread.
unsafe fn play(node: &str) {
    if let Some(app) = APP.get() {
        let _ = app.emit(
            "carplay:play",
            PlayRequest {
                node: node.to_string(),
            },
        );
    }
    let Some(controller) = INTERFACE_CONTROLLER.with(|slot| slot.borrow().clone()) else {
        return;
    };
    let now_playing: *mut AnyObject = msg_send![class!(CPNowPlayingTemplate), sharedTemplate];
    let top: *mut AnyObject = msg_send![&*controller, topTemplate];
    if top == now_playing {
        return;
    }
    let () = msg_send![
        &*controller,
        pushTemplate: now_playing,
        animated: Bool::YES,
        completion: std::ptr::null::<Block<dyn Fn(Bool, *mut AnyObject)>>()
    ];
}

fn send_command(action: &'static str) {
    crate::app_eprintln!("[carplay] command {action}");
    if let Some(app) = APP.get() {
        let _ = app.emit("carplay:command", CommandRequest { action });
    }
}

/// Up-next and album/artist buttons on CarPlay's now-playing screen, plus our own
/// shuffle / repeat / heart buttons.
///
/// # Safety
/// Main thread.
unsafe fn setup_now_playing() {
    let now_playing: *mut AnyObject = msg_send![class!(CPNowPlayingTemplate), sharedTemplate];
    let () = msg_send![now_playing, setUpNextButtonEnabled: Bool::YES];
    let () = msg_send![now_playing, setAlbumArtistButtonEnabled: Bool::YES];
    let registered = NOW_PLAYING_OBSERVER.with(|slot| slot.borrow().is_some());
    if !registered {
        let class = NowPlayingObserver::class();
        let protocol = ffi::objc_getProtocol(c"CPNowPlayingTemplateObserver".as_ptr());
        if !protocol.is_null() {
            ffi::class_addProtocol(class as *const AnyClass as *mut AnyClass, protocol);
        }
        let mtm = MainThreadMarker::new_unchecked();
        let observer: Retained<NowPlayingObserver> =
            msg_send![NowPlayingObserver::alloc(mtm), init];
        let () = msg_send![now_playing, addObserver: &*observer];
        NOW_PLAYING_OBSERVER.with(|slot| *slot.borrow_mut() = Some(observer));
    }
    // A new car connection starts with default buttons.
    BUTTONS_STARRED.with(|last| last.set(None));
    update_now_playing_buttons();
}

/// CarPlay only shows the state of its shuffle and repeat buttons while the app provides the
/// matching remote commands: enabled and with a target. Setting the current mode alone leaves
/// the buttons looking off. A press from elsewhere (not CarPlay's own buttons, which call their
/// handlers) is sent on as the same command.
///
/// # Safety
/// Main thread; `center` is the shared `MPRemoteCommandCenter`.
unsafe fn ensure_mode_commands(center: *mut AnyObject) {
    if MODE_COMMANDS_READY.with(|ready| ready.replace(true)) {
        return;
    }
    let shuffle_command: *mut AnyObject = msg_send![center, changeShuffleModeCommand];
    let on_shuffle: RcBlock<dyn Fn(NonNull<AnyObject>) -> isize> =
        RcBlock::new(|_event: NonNull<AnyObject>| {
            send_command("shuffle");
            COMMAND_SUCCESS
        });
    let _target: *mut AnyObject = msg_send![shuffle_command, addTargetWithHandler: &*on_shuffle];
    let () = msg_send![shuffle_command, setEnabled: Bool::YES];

    let repeat_command: *mut AnyObject = msg_send![center, changeRepeatModeCommand];
    let on_repeat: RcBlock<dyn Fn(NonNull<AnyObject>) -> isize> =
        RcBlock::new(|_event: NonNull<AnyObject>| {
            send_command("repeat");
            COMMAND_SUCCESS
        });
    let _target: *mut AnyObject = msg_send![repeat_command, addTargetWithHandler: &*on_repeat];
    let () = msg_send![repeat_command, setEnabled: Bool::YES];
}

/// Rebuilds the shuffle / repeat / heart buttons for the current state.
///
/// # Safety
/// Main thread.
unsafe fn update_now_playing_buttons() {
    let state = STATE.with(|slot| slot.borrow().clone());
    crate::app_eprintln!(
        "[carplay] state shuffle={} repeat={} starred={}",
        state.shuffle,
        state.repeat,
        state.starred
    );
    if BUTTONS_STARRED.with(|last| last.replace(Some(state.starred))) != Some(state.starred) {
        rebuild_now_playing_buttons(state.starred);
    }

    // CarPlay draws the shuffle / repeat buttons from the remote command centre's modes.
    let center: *mut AnyObject = msg_send![class!(MPRemoteCommandCenter), sharedCommandCenter];
    ensure_mode_commands(center);
    let shuffle_command: *mut AnyObject = msg_send![center, changeShuffleModeCommand];
    let shuffle_type = if state.shuffle {
        SHUFFLE_ITEMS
    } else {
        SHUFFLE_OFF
    };
    let () = msg_send![shuffle_command, setCurrentShuffleType: shuffle_type];
    let repeat_command: *mut AnyObject = msg_send![center, changeRepeatModeCommand];
    let repeat_type = match state.repeat.as_str() {
        "one" => REPEAT_ONE,
        "all" => REPEAT_ALL,
        _ => REPEAT_OFF,
    };
    let () = msg_send![repeat_command, setCurrentRepeatType: repeat_type];
}

/// The shuffle / repeat / heart buttons themselves; only the heart changes with the state.
///
/// # Safety
/// Main thread.
unsafe fn rebuild_now_playing_buttons(starred: bool) {
    let now_playing: *mut AnyObject = msg_send![class!(CPNowPlayingTemplate), sharedTemplate];
    let buttons = mutable_array();

    let on_shuffle: RcBlock<dyn Fn(NonNull<AnyObject>)> =
        RcBlock::new(|_button: NonNull<AnyObject>| send_command("shuffle"));
    let shuffle: Allocated<AnyObject> = msg_send![class!(CPNowPlayingShuffleButton), alloc];
    let shuffle: Retained<AnyObject> = msg_send![shuffle, initWithHandler: &*on_shuffle];
    let () = msg_send![&*buttons, addObject: &*shuffle];

    let on_repeat: RcBlock<dyn Fn(NonNull<AnyObject>)> =
        RcBlock::new(|_button: NonNull<AnyObject>| send_command("repeat"));
    let repeat: Allocated<AnyObject> = msg_send![class!(CPNowPlayingRepeatButton), alloc];
    let repeat: Retained<AnyObject> = msg_send![repeat, initWithHandler: &*on_repeat];
    let () = msg_send![&*buttons, addObject: &*repeat];

    let heart_symbol = if starred { "heart.fill" } else { "heart" };
    let heart_image: *mut AnyObject =
        msg_send![class!(UIImage), systemImageNamed: &*ns(heart_symbol)];
    if !heart_image.is_null() {
        let on_heart: RcBlock<dyn Fn(NonNull<AnyObject>)> =
            RcBlock::new(|_button: NonNull<AnyObject>| send_command("star"));
        let heart: Allocated<AnyObject> = msg_send![class!(CPNowPlayingImageButton), alloc];
        let heart: Retained<AnyObject> =
            msg_send![heart, initWithImage: heart_image, handler: &*on_heart];
        let () = msg_send![&*buttons, addObject: &*heart];
    }
    let () = msg_send![now_playing, updateNowPlayingButtons: &*buttons];
}
