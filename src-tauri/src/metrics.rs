use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Metrics {
    pub at_ms: u64,
    pub cpu_seconds: f64,
    pub max_rss_mb: f64,
    pub battery: Option<f64>,
    pub library_bytes: u64,
    pub wal_bytes: u64,
    pub cluster_bytes: u64,
}

fn file_size(path: &Path) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

pub fn collect(app: &AppHandle) -> Metrics {
    let dir = app
        .path()
        .app_data_dir()
        .map(|d| d.join("databases").join("library"))
        .unwrap_or_default();
    let (cpu_seconds, max_rss_mb) = process_usage();
    Metrics {
        at_ms: crate::player::now_ms(),
        cpu_seconds,
        max_rss_mb,
        battery: battery_level(),
        library_bytes: file_size(&dir.join("library.sqlite")),
        wal_bytes: file_size(&dir.join("library.sqlite-wal")),
        cluster_bytes: file_size(&dir.join("library-cluster.db")),
    }
}

#[cfg(unix)]
fn process_usage() -> (f64, f64) {
    let mut usage = std::mem::MaybeUninit::<libc::rusage>::zeroed();
    if unsafe { libc::getrusage(libc::RUSAGE_SELF, usage.as_mut_ptr()) } != 0 {
        return (0.0, 0.0);
    }
    let usage = unsafe { usage.assume_init() };
    let secs = |t: libc::timeval| t.tv_sec as f64 + t.tv_usec as f64 / 1_000_000.0;
    let cpu = secs(usage.ru_utime) + secs(usage.ru_stime);
    // Apple platforms report ru_maxrss in bytes, Linux in kilobytes.
    let rss_bytes = if cfg!(target_vendor = "apple") {
        usage.ru_maxrss as f64
    } else {
        usage.ru_maxrss as f64 * 1024.0
    };
    (cpu, rss_bytes / 1_048_576.0)
}

#[cfg(not(unix))]
fn process_usage() -> (f64, f64) {
    (0.0, 0.0)
}

#[cfg(target_os = "ios")]
fn battery_level() -> Option<f64> {
    let mtm = objc2::MainThreadMarker::new()?;
    let device = objc2_ui_kit::UIDevice::currentDevice(mtm);
    device.setBatteryMonitoringEnabled(true);
    let level = device.batteryLevel();
    (level >= 0.0).then_some(f64::from(level) * 100.0)
}

#[cfg(not(target_os = "ios"))]
fn battery_level() -> Option<f64> {
    None
}

#[cfg(target_os = "ios")]
pub fn keep_awake(on: bool) {
    if let Some(mtm) = objc2::MainThreadMarker::new() {
        objc2_ui_kit::UIApplication::sharedApplication(mtm).setIdleTimerDisabled(on);
    }
}

#[cfg(not(target_os = "ios"))]
pub fn keep_awake(_on: bool) {}
