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
//! A section with `more` is a row of covers (`CPListImageRowItem`) whose title opens the
//! full list; rows without a cover can show a symbol (`icon`).
//!
//! On a cold start from the car the web layer may not listen yet: requests wait here
//! and are sent again when it reports `carplay:ready`. If it has not reported after a few
//! seconds (Psysonic was closed on the phone and iOS started only the car), the loading
//! screen asks to open Psysonic on the iPhone instead of showing "…" forever. tao is left
//! out entirely; the phone scene starts exactly as before.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::ptr::NonNull;
use std::sync::OnceLock;

use block2::{Block, RcBlock};
use objc2::rc::{Allocated, Retained};
use objc2::runtime::{AnyClass, AnyObject, Bool, NSObject};
use objc2::{class, define_class, ffi, msg_send, sel, ClassType, MainThreadMarker, MainThreadOnly};
use objc2_foundation::NSString;
use tauri::{AppHandle, Emitter, Listener};

/// Session role of a CarPlay scene (`CPTemplateApplicationSceneSessionRoleApplication`).
pub(crate) const ROLE_CARPLAY: &str = "CPTemplateApplicationSceneSessionRoleApplication";

/// The list the web layer answers with the tab bar's tabs.
const NODE_TABS: &str = "tabs";
/// `CPListItemAccessoryTypeDisclosureIndicator`.
const ACCESSORY_DISCLOSURE: isize = 1;
/// CarPlay shows at most this many tabs for an audio app.
const MAX_TABS: usize = 4;
/// Seconds without `carplay:ready` before the loading screen asks to open the app.
const OPEN_ON_PHONE_DELAY: f64 = 6.0;

#[link(name = "CarPlay", kind = "framework")]
unsafe extern "C" {
    /// Most images one `CPListImageRowItem` takes.
    static CPMaximumNumberOfGridImages: usize;
}

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
    static SHOWN: RefCell<HashMap<u64, Vec<ShownSection>>> = RefCell::new(HashMap::new());
    /// What the now-playing buttons show, as last reported by the web layer.
    static STATE: RefCell<NowPlayingState> = RefCell::new(NowPlayingState::default());
    /// Observer for the now-playing template's up-next and album/artist buttons.
    static NOW_PLAYING_OBSERVER: RefCell<Option<Retained<NowPlayingObserver>>> = const { RefCell::new(None) };
    /// The shuffle / repeat remote commands are enabled and have their target (done once).
    static MODE_COMMANDS_READY: Cell<bool> = const { Cell::new(false) };
    /// The heart and ∞ states the now-playing buttons were last built with; rebuilding them
    /// on every shuffle / repeat change made the buttons flash twice.
    static BUTTONS_BUILT: Cell<Option<(bool, bool)>> = const { Cell::new(None) };
    /// The web layer has reported `carplay:ready`, so it answers list requests.
    static WEB_READY: Cell<bool> = const { Cell::new(false) };
}

/// The rows of one shown section, kept so covers that arrive later find their place.
enum ShownSection {
    Rows(Vec<Retained<AnyObject>>),
    /// A row of covers: the row and the images it shows, in order. From iOS 26 each cover is
    /// an element with its own title and subtitle (`elements`); before that only images.
    Covers {
        row: Retained<AnyObject>,
        images: Vec<Retained<AnyObject>>,
        elements: Option<Vec<Retained<AnyObject>>>,
    },
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
    /// The infinite queue is on.
    #[serde(default)]
    infinite: bool,
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
    /// Set on a row of covers: the node its title opens.
    more: Option<String>,
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
    /// Symbol shown when there is no cover (`CarPlayIcon` in the web layer).
    icon: Option<String>,
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
                crate::ios::audio_session::car_connected(app);
            }
            let retained =
                unsafe { Retained::retain(controller as *const AnyObject as *mut AnyObject) };
            INTERFACE_CONTROLLER.with(|slot| *slot.borrow_mut() = retained);
            // SAFETY: main thread (UIKit callback), controller is a live CPInterfaceController.
            unsafe {
                setup_now_playing();
                show_loading_root(controller);
                let () = msg_send![
                    self,
                    performSelector: sel!(psyShowOpenOnPhoneHint),
                    withObject: std::ptr::null::<AnyObject>(),
                    afterDelay: OPEN_ON_PHONE_DELAY
                ];
            }
        }

        /// Psysonic did not start behind the car: ask to open it on the phone.
        #[unsafe(method(psyShowOpenOnPhoneHint))]
        fn show_open_on_phone_hint(&self) {
            if WEB_READY.with(Cell::get) {
                return;
            }
            crate::app_eprintln!("[carplay] web layer not ready, asking to open the app");
            PENDING.with(|pending| {
                for (node, template) in pending.borrow().values() {
                    if node == NODE_TABS {
                        // SAFETY: main thread (performSelector on the main run loop). CarPlay
                        // only redraws a shown list's empty text when its sections change.
                        unsafe {
                            set_empty_text(template, &open_on_phone_text());
                            let () = msg_send![&**template, updateSections: &*mutable_array()];
                        }
                    }
                }
            });
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
        let _ = ready.run_on_main_thread(|| {
            WEB_READY.with(|ready| ready.set(true));
            resend_pending();
        });
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

/// The car's text before the web layer (and its translations) exists: German or English,
/// after the phone's first language.
fn open_on_phone_text() -> String {
    // SAFETY: plain Foundation reads.
    let german = unsafe {
        let languages: *mut AnyObject = msg_send![class!(NSLocale), preferredLanguages];
        let first: *mut AnyObject = if languages.is_null() {
            std::ptr::null_mut()
        } else {
            msg_send![languages, firstObject]
        };
        !first.is_null() && (*(first as *const NSString)).to_string().starts_with("de")
    };
    if german {
        "Bitte Psysonic einmal auf dem iPhone öffnen".to_string()
    } else {
        "Open Psysonic on your iPhone once".to_string()
    }
}

/// SF Symbol for a row or tab symbol sent by the web layer.
fn symbol_name(icon: &str) -> &'static str {
    match icon {
        "home" => "house.fill",
        "library" => "square.stack.fill",
        "playlists" => "music.note.list",
        "lucky" => "sparkles",
        "shuffle" => "shuffle",
        "resume" => "play.circle.fill",
        "heart" => "heart.fill",
        "download" => "arrow.down.circle.fill",
        "radio" => "dot.radiowaves.left.and.right",
        _ => "music.note",
    }
}

/// # Safety
/// Main thread.
unsafe fn symbol_image(icon: &str) -> Option<Retained<AnyObject>> {
    msg_send![class!(UIImage), systemImageNamed: &*ns(symbol_name(icon))]
}

/// # Safety
/// Main thread.
unsafe fn file_image(path: &str) -> Option<Retained<AnyObject>> {
    msg_send![class!(UIImage), imageWithContentsOfFile: &*ns(path)]
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
    for tab in tabs.take(MAX_TABS) {
        let list = loading_list(&tab.title, loading);
        let () = msg_send![&*list, setTabTitle: &*ns(&tab.title)];
        if let Some(image) = symbol_image(tab.icon.as_deref().unwrap_or_default()) {
            let () = msg_send![&*list, setTabImage: &*image];
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
unsafe fn build_sections(sections: &[Section]) -> (Retained<AnyObject>, Vec<ShownSection>) {
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
        let mut header = section.header.as_deref().map(ns);
        if let Some(more) = section.more.as_deref() {
            let title = section.header.clone().unwrap_or_default();
            let (row, images, elements) = cover_row(&title, more, &section.items);
            let () = msg_send![&*items, addObject: &*row];
            kept.push(ShownSection::Covers {
                row,
                images,
                elements,
            });
            budget -= 1;
            header = None; // the row carries the title
        } else {
            let mut section_rows = Vec::new();
            for item in section.items.iter().take(budget) {
                let row = list_item(item);
                let () = msg_send![&*items, addObject: &*row];
                section_rows.push(row);
            }
            kept.push(ShownSection::Rows(section_rows));
            budget = budget.saturating_sub(section.items.len());
        }
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
    if let Some(image) = file_image(path) {
        let () = msg_send![row, setImage: &*image];
    }
}

/// # Safety
/// Main thread.
unsafe fn image_array(images: &[Retained<AnyObject>]) -> Retained<AnyObject> {
    let array = mutable_array();
    for image in images {
        let () = msg_send![&*array, addObject: &**image];
    }
    array
}

/// A row of covers titled `title`: a cover opens or plays its item, the title opens `more`.
/// Covers not on disk yet show a symbol until `apply_images` swaps them in. iOS 26 and later
/// get `CPListImageRowItemRowElement`s (cover, title and artist, the current API); older
/// systems the plain image row (`initWithText:images:`, deprecated since iOS 26).
///
/// # Safety
/// Main thread.
#[allow(clippy::type_complexity)]
unsafe fn cover_row(
    title: &str,
    more: &str,
    items: &[Item],
) -> (
    Retained<AnyObject>,
    Vec<Retained<AnyObject>>,
    Option<Vec<Retained<AnyObject>>>,
) {
    // A global constant, not a class method: messaging the class for it raised an
    // Objective-C exception, which aborted the app when the first row was built.
    let max_images = CPMaximumNumberOfGridImages;
    let shown: Vec<&Item> = items.iter().take(max_images).collect();
    let images: Vec<Retained<AnyObject>> = shown
        .iter()
        .filter_map(|item| {
            item.image
                .as_deref()
                .and_then(|path| file_image(path))
                .or_else(|| symbol_image(item.icon.as_deref().unwrap_or_default()))
        })
        .collect();
    let row: Allocated<AnyObject> = msg_send![class!(CPListImageRowItem), alloc];
    let (row, elements): (Retained<AnyObject>, _) =
        match AnyClass::get(c"CPListImageRowItemRowElement") {
            Some(element_class) => {
                let elements: Vec<Retained<AnyObject>> = shown
                    .iter()
                    .zip(&images)
                    .map(|(item, image)| {
                        let subtitle = item.subtitle.as_deref().map(ns);
                        let subtitle_ptr: *const NSString = subtitle
                            .as_deref()
                            .map_or(std::ptr::null(), |s| s as *const NSString);
                        let element: Allocated<AnyObject> = msg_send![element_class, alloc];
                        msg_send![
                            element,
                            initWithImage: &**image,
                            title: &*ns(&item.title),
                            subtitle: subtitle_ptr
                        ]
                    })
                    .collect();
                let row: Retained<AnyObject> = msg_send![
                    row,
                    initWithText: &*ns(title),
                    elements: &*image_array(&elements),
                    allowsMultipleLines: Bool::NO
                ];
                (row, Some(elements))
            }
            None => {
                let row: Retained<AnyObject> = msg_send![
                    row,
                    initWithText: &*ns(title),
                    images: &*image_array(&images)
                ];
                (row, None)
            }
        };

    let targets: Vec<(String, String, bool)> = shown
        .iter()
        .map(|item| (item.node.clone(), item.title.clone(), item.browse))
        .collect();
    let on_image: RcBlock<dyn Fn(NonNull<AnyObject>, isize, NonNull<Block<dyn Fn()>>)> =
        RcBlock::new(
            move |_row: NonNull<AnyObject>, index: isize, done: NonNull<Block<dyn Fn()>>| {
                // SAFETY: CarPlay calls list handlers on the main thread.
                unsafe {
                    if let Some((node, title, browse)) = usize::try_from(index)
                        .ok()
                        .and_then(|index| targets.get(index))
                    {
                        if *browse {
                            open_list(node, title);
                        } else {
                            play(node);
                        }
                    }
                    done.as_ref().call(());
                }
            },
        );
    let () = msg_send![&*row, setListImageRowHandler: &*on_image];

    let more = more.to_string();
    let title = title.to_string();
    let on_title: RcBlock<dyn Fn(NonNull<AnyObject>, NonNull<Block<dyn Fn()>>)> = RcBlock::new(
        move |_row: NonNull<AnyObject>, done: NonNull<Block<dyn Fn()>>| {
            // SAFETY: as above.
            unsafe {
                open_list(&more, &title);
                done.as_ref().call(());
            }
        },
    );
    let () = msg_send![&*row, setHandler: &*on_title];
    (row, images, elements)
}

/// Covers downloaded after their list was shown.
///
/// # Safety
/// Main thread; rows in SHOWN are live CPListItems.
unsafe fn apply_images(updates: ImageUpdates) {
    SHOWN.with(|shown| {
        let mut shown = shown.borrow_mut();
        let Some(sections) = shown.get_mut(&updates.request_id) else {
            return;
        };
        let mut changed_cover_rows = Vec::new();
        for update in &updates.images {
            match sections.get_mut(update.section) {
                Some(ShownSection::Rows(rows)) => {
                    if let Some(row) = rows.get(update.row) {
                        set_row_image(row, &update.image);
                    }
                }
                Some(ShownSection::Covers {
                    images, elements, ..
                }) => {
                    if let (Some(slot), Some(image)) =
                        (images.get_mut(update.row), file_image(&update.image))
                    {
                        match elements.as_ref().and_then(|e| e.get(update.row)) {
                            // An element shows its new image itself.
                            Some(element) => {
                                let () = msg_send![&**element, setImage: &*image];
                            }
                            None => changed_cover_rows.push(update.section),
                        }
                        *slot = image;
                    }
                }
                None => {}
            }
        }
        changed_cover_rows.dedup();
        for index in changed_cover_rows {
            if let Some(ShownSection::Covers { row, images, .. }) = sections.get(index) {
                let () = msg_send![&**row, updateImages: &*image_array(images)];
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
    } else if let Some(image) = item.icon.as_deref().and_then(|icon| symbol_image(icon)) {
        let () = msg_send![&*row, setImage: &*image];
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
    BUTTONS_BUILT.with(|last| last.set(None));
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
            press_mode("shuffle");
            COMMAND_SUCCESS
        });
    let _target: *mut AnyObject = msg_send![shuffle_command, addTargetWithHandler: &*on_shuffle];
    let () = msg_send![shuffle_command, setEnabled: Bool::YES];

    let repeat_command: *mut AnyObject = msg_send![center, changeRepeatModeCommand];
    let on_repeat: RcBlock<dyn Fn(NonNull<AnyObject>) -> isize> =
        RcBlock::new(|_event: NonNull<AnyObject>| {
            press_mode("repeat");
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
    let built = (state.starred, state.infinite);
    if BUTTONS_BUILT.with(|last| last.replace(Some(built))) != Some(built) {
        rebuild_now_playing_buttons(state.starred, state.infinite);
    }

    apply_modes(state.shuffle, &state.repeat);
}

/// CarPlay draws the shuffle / repeat buttons from the remote command centre's modes.
///
/// # Safety
/// Main thread.
unsafe fn apply_modes(shuffle: bool, repeat: &str) {
    let center: *mut AnyObject = msg_send![class!(MPRemoteCommandCenter), sharedCommandCenter];
    ensure_mode_commands(center);
    let shuffle_command: *mut AnyObject = msg_send![center, changeShuffleModeCommand];
    let shuffle_type = if shuffle { SHUFFLE_ITEMS } else { SHUFFLE_OFF };
    let () = msg_send![shuffle_command, setCurrentShuffleType: shuffle_type];
    let repeat_command: *mut AnyObject = msg_send![center, changeRepeatModeCommand];
    let repeat_type = match repeat {
        "one" => REPEAT_ONE,
        "all" => REPEAT_ALL,
        _ => REPEAT_OFF,
    };
    let () = msg_send![repeat_command, setCurrentRepeatType: repeat_type];
}

/// The mode a repeat press leads to; the player cycles off → all → one → off.
fn next_repeat(repeat: &str) -> &'static str {
    match repeat {
        "off" | "" => "all",
        "all" => "one",
        _ => "off",
    }
}

/// A press on the shuffle or repeat button. CarPlay flips the button at once and then reads
/// the remote command centre, which still held the old mode until the web layer answered:
/// the button flashed on, off, on. Show the expected mode right away; the web layer's state
/// confirms it, and if it leaves the mode alone (an Orbit guest, say) the real one returns.
///
/// Main thread (CarPlay button and remote-command handlers).
fn press_mode(action: &'static str) {
    let state = STATE.with(|slot| slot.borrow().clone());
    // SAFETY: the handlers run on the main thread.
    unsafe {
        match action {
            "shuffle" => apply_modes(!state.shuffle, &state.repeat),
            _ => apply_modes(state.shuffle, next_repeat(&state.repeat)),
        }
    }
    send_command(action);
    if let Some(app) = APP.get() {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            let _ = app.run_on_main_thread(|| {
                let state = STATE.with(|slot| slot.borrow().clone());
                // SAFETY: main thread.
                unsafe { apply_modes(state.shuffle, &state.repeat) };
            });
        });
    }
}

/// The shuffle / repeat / heart / ∞ buttons themselves; the heart and ∞ change with the state.
///
/// # Safety
/// Main thread.
unsafe fn rebuild_now_playing_buttons(starred: bool, infinite: bool) {
    let now_playing: *mut AnyObject = msg_send![class!(CPNowPlayingTemplate), sharedTemplate];
    let buttons = mutable_array();

    let on_shuffle: RcBlock<dyn Fn(NonNull<AnyObject>)> =
        RcBlock::new(|_button: NonNull<AnyObject>| press_mode("shuffle"));
    let shuffle: Allocated<AnyObject> = msg_send![class!(CPNowPlayingShuffleButton), alloc];
    let shuffle: Retained<AnyObject> = msg_send![shuffle, initWithHandler: &*on_shuffle];
    let () = msg_send![&*buttons, addObject: &*shuffle];

    let on_repeat: RcBlock<dyn Fn(NonNull<AnyObject>)> =
        RcBlock::new(|_button: NonNull<AnyObject>| press_mode("repeat"));
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

    let infinity_image: *mut AnyObject =
        msg_send![class!(UIImage), systemImageNamed: &*ns("infinity")];
    if !infinity_image.is_null() {
        let on_infinite: RcBlock<dyn Fn(NonNull<AnyObject>)> =
            RcBlock::new(|_button: NonNull<AnyObject>| send_command("infinite"));
        let button: Allocated<AnyObject> = msg_send![class!(CPNowPlayingImageButton), alloc];
        let button: Retained<AnyObject> =
            msg_send![button, initWithImage: infinity_image, handler: &*on_infinite];
        // Highlighted while the infinite queue is on.
        let () = msg_send![&*button, setSelected: Bool::new(infinite)];
        let () = msg_send![&*buttons, addObject: &*button];
    }
    let () = msg_send![now_playing, updateNowPlayingButtons: &*buttons];
}
