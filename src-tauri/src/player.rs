use std::io::Cursor;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rodio::{Decoder, DeviceSinkBuilder, Player, Source};
use serde::Serialize;

pub enum Command {
    Play { id: u32, url: String },
    Pause,
    Resume,
    Toggle,
    Stop,
}

#[derive(Clone, Serialize)]
pub struct Event {
    pub at: u64,
    pub kind: &'static str,
    pub id: u32,
    pub seconds: f64,
    pub detail: String,
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn spawn(on_event: impl Fn(Event) + Send + 'static) -> Sender<Command> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || run(rx, on_event));
    tx
}

fn run(rx: Receiver<Command>, on_event: impl Fn(Event)) {
    let emit = |kind: &'static str, id: u32, seconds: f64, detail: String| {
        on_event(Event {
            at: now_ms(),
            kind,
            id,
            seconds,
            detail,
        })
    };

    if let Err(err) = session::activate() {
        emit("error", 0, 0.0, format!("audio session: {err}"));
    }
    let mut sink = match DeviceSinkBuilder::open_default_sink() {
        Ok(sink) => sink,
        Err(err) => {
            emit("error", 0, 0.0, format!("output: {err}"));
            return;
        }
    };
    sink.log_on_drop(false);
    emit("ready", 0, 0.0, String::new());

    let client = reqwest::blocking::Client::new();
    let mut current: Option<(u32, Player)> = None;

    loop {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(Command::Play { id, url }) => {
                emit("command", id, 0.0, "play".into());
                current = None;
                match fetch(&client, &url) {
                    Ok(bytes) => match Decoder::new(Cursor::new(bytes)) {
                        Ok(source) => {
                            let duration = source
                                .total_duration()
                                .map(|d| d.as_secs_f64())
                                .unwrap_or(0.0);
                            let player = Player::connect_new(sink.mixer());
                            player.append(source);
                            emit("started", id, duration, String::new());
                            current = Some((id, player));
                        }
                        Err(err) => emit("error", id, 0.0, format!("decode: {err}")),
                    },
                    Err(err) => emit("error", id, 0.0, format!("fetch: {err}")),
                }
            }
            Ok(command @ (Command::Pause | Command::Resume | Command::Toggle)) => {
                if let Some((id, player)) = &current {
                    let pause = match command {
                        Command::Pause => true,
                        Command::Resume => false,
                        _ => !player.is_paused(),
                    };
                    if pause {
                        player.pause();
                    } else {
                        player.play();
                    }
                    let kind = if pause { "paused" } else { "resumed" };
                    emit(kind, *id, player.get_pos().as_secs_f64(), String::new());
                }
            }
            Ok(Command::Stop) => {
                current = None;
                emit("stopped", 0, 0.0, String::new());
            }
            Err(RecvTimeoutError::Timeout) => {
                if current.as_ref().is_some_and(|(_, player)| player.empty())
                    && let Some((id, _)) = current.take()
                {
                    emit("ended", id, 0.0, String::new());
                }
            }
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

fn fetch(client: &reqwest::blocking::Client, url: &str) -> Result<Vec<u8>, String> {
    let response = client
        .get(url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(|e| e.to_string())?;
    response
        .bytes()
        .map(|b| b.to_vec())
        .map_err(|e| e.to_string())
}

pub fn fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    fetch(&reqwest::blocking::Client::new(), url)
}

#[cfg(target_os = "ios")]
mod session {
    use objc2_avf_audio::{AVAudioSession, AVAudioSessionCategoryPlayback};

    pub fn activate() -> Result<(), String> {
        unsafe {
            let session = AVAudioSession::sharedInstance();
            let category = AVAudioSessionCategoryPlayback.ok_or("playback category unavailable")?;
            session
                .setCategory_error(category)
                .map_err(|e| format!("{e:?}"))?;
            session
                .setActive_error(true)
                .map_err(|e| format!("{e:?}"))?;
        }
        Ok(())
    }
}

#[cfg(not(target_os = "ios"))]
mod session {
    pub fn activate() -> Result<(), String> {
        Ok(())
    }
}
