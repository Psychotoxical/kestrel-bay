use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use tauri::{Emitter, Manager, State};

mod player;

struct Audio {
    tx: Mutex<Sender<player::Command>>,
    log: Arc<Mutex<Vec<player::Event>>>,
}

#[tauri::command]
fn play(id: u32, url: String, audio: State<'_, Audio>) -> Result<(), String> {
    audio
        .tx
        .lock()
        .map_err(|e| e.to_string())?
        .send(player::Command::Play { id, url })
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn stop(audio: State<'_, Audio>) -> Result<(), String> {
    audio
        .tx
        .lock()
        .map_err(|e| e.to_string())?
        .send(player::Command::Stop)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn events(audio: State<'_, Audio>) -> Vec<player::Event> {
    audio.log.lock().map(|log| log.clone()).unwrap_or_default()
}

#[tauri::command]
fn clear_events(audio: State<'_, Audio>) {
    if let Ok(mut log) = audio.log.lock() {
        log.clear();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let log = Arc::new(Mutex::new(Vec::new()));
            let player_log = log.clone();
            let tx = player::spawn(move |event| {
                let _ = handle.emit("kb:event", &event);
                if let Ok(mut log) = player_log.lock() {
                    log.push(event);
                }
            });
            app.manage(Audio {
                tx: Mutex::new(tx),
                log,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![play, stop, events, clear_events])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
