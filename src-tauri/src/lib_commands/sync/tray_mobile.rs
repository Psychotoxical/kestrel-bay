//! Mobile stand-in for `tray.rs`. iOS and Android have no system tray and no
//! X11/Wayland session, so the commands keep their names (the frontend calls
//! them unconditionally) and report the neutral answer.

pub(crate) use crate::audio::stop_audio_engine;

#[tauri::command]
#[specta::specta]
pub(crate) fn set_tray_tooltip() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) fn set_tray_menu_labels() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) fn toggle_tray_icon() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub(crate) fn no_compositing_mode() -> bool {
    false
}

#[tauri::command]
#[specta::specta]
pub(crate) fn linux_xdg_session_type() -> String {
    String::new()
}

#[tauri::command]
#[specta::specta]
pub(crate) fn is_tiling_wm_cmd() -> bool {
    false
}
