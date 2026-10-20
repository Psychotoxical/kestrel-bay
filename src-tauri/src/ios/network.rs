//! Whether a download would run over a metered connection: cellular data, or a
//! Personal Hotspot (Network.framework's "expensive" path). The touch shell asks
//! before it downloads there and holds downloads that were not allowed to run.
//!
//! The path monitor reports every change; it reaches the web layer as
//! `ios-network:metered` (`true` / `false`). The first report can come before
//! the web layer listens, so `ios-network:query` repeats the last one.

use std::ffi::c_void;
use std::sync::atomic::{AtomicU8, Ordering};

use block2::{Block, RcBlock};
use tauri::{AppHandle, Emitter, Listener};

type NwPathMonitor = *mut c_void;
type NwPath = *mut c_void;
type DispatchQueue = *mut c_void;

/// `nw_path_status_satisfied`.
const PATH_SATISFIED: i32 = 1;

const UNKNOWN: u8 = 0;
const UNMETERED: u8 = 1;
const METERED: u8 = 2;

static LAST_STATE: AtomicU8 = AtomicU8::new(UNKNOWN);

#[link(name = "Network", kind = "framework")]
unsafe extern "C" {
    fn nw_path_monitor_create() -> NwPathMonitor;
    fn nw_path_monitor_set_queue(monitor: NwPathMonitor, queue: DispatchQueue);
    fn nw_path_monitor_set_update_handler(monitor: NwPathMonitor, handler: &Block<dyn Fn(NwPath)>);
    fn nw_path_monitor_start(monitor: NwPathMonitor);
    fn nw_path_get_status(path: NwPath) -> i32;
    fn nw_path_is_expensive(path: NwPath) -> bool;
}

// libdispatch, part of libSystem.
unsafe extern "C" {
    fn dispatch_queue_create(label: *const std::ffi::c_char, attr: *mut c_void) -> DispatchQueue;
}

fn report(app: &AppHandle, state: u8) {
    if state != UNKNOWN {
        let _ = app.emit("ios-network:metered", state == METERED);
    }
}

/// Starts the path monitor. Monitor, queue and handler live as long as the app.
pub(crate) fn observe(app: &AppHandle) {
    let update_app = app.clone();
    let on_update: RcBlock<dyn Fn(NwPath)> = RcBlock::new(move |path: NwPath| {
        // SAFETY: Network.framework hands us a live path for the duration of the call.
        let metered =
            unsafe { nw_path_get_status(path) == PATH_SATISFIED && nw_path_is_expensive(path) };
        let state = if metered { METERED } else { UNMETERED };
        if LAST_STATE.swap(state, Ordering::SeqCst) != state {
            report(&update_app, state);
        }
    });

    // SAFETY: the monitor and its serial queue are created once and never released;
    // the framework copies the handler block.
    unsafe {
        let monitor = nw_path_monitor_create();
        if monitor.is_null() {
            crate::app_eprintln!("[offline] network path monitor unavailable");
            return;
        }
        let queue = dispatch_queue_create(c"psysonic.network-path".as_ptr(), std::ptr::null_mut());
        nw_path_monitor_set_queue(monitor, queue);
        nw_path_monitor_set_update_handler(monitor, &on_update);
        nw_path_monitor_start(monitor);
    }

    let query_app = app.clone();
    app.listen_any("ios-network:query", move |_| {
        report(&query_app, LAST_STATE.load(Ordering::SeqCst));
    });
}
