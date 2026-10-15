use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager, State};

mod nowplaying;
mod player;
mod subsonic;

struct Audio {
    tx: Mutex<Sender<player::Command>>,
    log: Arc<Mutex<Vec<player::Event>>>,
    now_playing: AtomicU32,
}

impl Audio {
    fn send(&self, command: player::Command) -> Result<(), String> {
        self.tx
            .lock()
            .map_err(|e| e.to_string())?
            .send(command)
            .map_err(|e| e.to_string())
    }
}

fn record(log: &Mutex<Vec<player::Event>>, event: player::Event) {
    if let Ok(mut log) = log.lock() {
        log.push(event);
    }
}

#[tauri::command]
fn play(id: u32, url: String, hint: Option<String>, audio: State<'_, Audio>) -> Result<(), String> {
    audio.send(player::Command::Play { id, url, hint })
}

#[tauri::command]
fn make_token(password: String) -> subsonic::Token {
    subsonic::make_token(&password)
}

#[tauri::command]
async fn random_songs(
    server: String,
    user: String,
    salt: String,
    token: String,
    size: u32,
) -> Result<Vec<subsonic::Song>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        subsonic::random_songs(&server, &user, &salt, &token, size)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn stop(audio: State<'_, Audio>) -> Result<(), String> {
    audio.send(player::Command::Stop)
}

#[tauri::command]
fn toggle(audio: State<'_, Audio>) -> Result<(), String> {
    audio.send(player::Command::Toggle)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
fn now_playing(
    id: u32,
    title: String,
    artist: String,
    album: String,
    duration: f64,
    cover_url: String,
    app: AppHandle,
    audio: State<'_, Audio>,
) -> Result<(), String> {
    audio.now_playing.store(id, Ordering::SeqCst);
    let track = nowplaying::Track {
        title,
        artist,
        album,
        duration,
    };
    app.run_on_main_thread(move || nowplaying::set_track(id, track))
        .map_err(|e| e.to_string())?;

    let handle = app.clone();
    std::thread::spawn(move || match player::fetch_bytes(&cover_url) {
        Ok(bytes) => {
            let _ = handle.run_on_main_thread(move || nowplaying::set_cover(id, bytes));
        }
        Err(err) => {
            let audio = handle.state::<Audio>();
            record(
                &audio.log,
                player::Event {
                    at: player::now_ms(),
                    kind: "error",
                    id,
                    seconds: 0.0,
                    detail: format!("cover: {err}"),
                },
            );
        }
    });
    Ok(())
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

fn on_player_event(app: &AppHandle, log: &Mutex<Vec<player::Event>>, event: player::Event) {
    match event.kind {
        "paused" | "resumed" => {
            let playing = event.kind == "resumed";
            let elapsed = event.seconds;
            let _ = app.run_on_main_thread(move || nowplaying::set_playback(playing, elapsed));
        }
        "stopped" => {
            let _ = app.run_on_main_thread(nowplaying::clear);
        }
        _ => {}
    }
    let _ = app.emit("kb:event", &event);
    record(log, event);
}

fn on_remote_command(app: &AppHandle, name: &'static str) {
    let audio = app.state::<Audio>();
    record(
        &audio.log,
        player::Event {
            at: player::now_ms(),
            kind: "remote",
            id: audio.now_playing.load(Ordering::SeqCst),
            seconds: 0.0,
            detail: name.into(),
        },
    );
    let result = match name {
        "play" => audio.send(player::Command::Resume),
        "pause" => audio.send(player::Command::Pause),
        "toggle" => audio.send(player::Command::Toggle),
        _ => app.emit("kb:remote", name).map_err(|e| e.to_string()),
    };
    if let Err(err) = result {
        record(
            &audio.log,
            player::Event {
                at: player::now_ms(),
                kind: "error",
                id: 0,
                seconds: 0.0,
                detail: format!("remote {name}: {err}"),
            },
        );
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
            let tx = player::spawn(move |event| on_player_event(&handle, &player_log, event));
            app.manage(Audio {
                tx: Mutex::new(tx),
                log,
                now_playing: AtomicU32::new(0),
            });

            let remote_handle = app.handle().clone();
            nowplaying::register_remote(move |name| on_remote_command(&remote_handle, name));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            play,
            make_token,
            random_songs,
            stop,
            toggle,
            now_playing,
            events,
            clear_events
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
