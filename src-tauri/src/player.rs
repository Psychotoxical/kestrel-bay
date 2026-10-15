use std::io::{self, Read, Seek, SeekFrom};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use rodio::{Decoder, DeviceSinkBuilder, Player, Source};
use serde::Serialize;

pub enum Command {
    Play {
        id: u32,
        url: String,
        hint: Option<String>,
    },
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

/// Drops the query string of every URL in `text`, so tokens never reach logs or the UI.
pub fn scrub(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut in_url = false;
    let mut skipping = false;
    for (i, c) in text.char_indices() {
        if text[i..].starts_with("http") {
            in_url = true;
        }
        if c.is_whitespace() || c == ')' {
            in_url = false;
            skipping = false;
        }
        if in_url && c == '?' && !skipping {
            skipping = true;
            out.push_str("?…");
        }
        if !skipping {
            out.push(c);
        }
    }
    out
}

fn request_error(err: reqwest::Error) -> String {
    scrub(&err.without_url().to_string())
}

fn io_error(err: io::Error) -> String {
    match err.into_inner() {
        Some(inner) => match inner.downcast::<reqwest::Error>() {
            Ok(err) => request_error(*err),
            Err(other) => scrub(&other.to_string()),
        },
        None => "read failed".into(),
    }
}

struct Download {
    bytes: Vec<u8>,
    done: bool,
    error: Option<String>,
}

struct Shared {
    state: Mutex<Download>,
    changed: Condvar,
}

impl Shared {
    fn finish(&self, error: Option<String>) {
        if let Ok(mut state) = self.state.lock() {
            state.done = true;
            state.error = error;
        }
        self.changed.notify_all();
    }
}

struct StreamReader {
    shared: Arc<Shared>,
    pos: u64,
    len: Option<u64>,
}

impl Read for StreamReader {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let mut state = self
            .shared
            .state
            .lock()
            .map_err(|_| io::Error::other("stream lock poisoned"))?;
        loop {
            let available = state.bytes.len() as u64;
            if self.pos < available {
                let start = self.pos as usize;
                let n = buf.len().min(state.bytes.len() - start);
                buf[..n].copy_from_slice(&state.bytes[start..start + n]);
                self.pos += n as u64;
                return Ok(n);
            }
            if state.done {
                return match &state.error {
                    Some(err) => Err(io::Error::other(err.clone())),
                    None => Ok(0),
                };
            }
            state = self
                .shared
                .changed
                .wait(state)
                .map_err(|_| io::Error::other("stream lock poisoned"))?;
        }
    }
}

impl Seek for StreamReader {
    fn seek(&mut self, pos: SeekFrom) -> io::Result<u64> {
        let target = match pos {
            SeekFrom::Start(p) => i128::from(p),
            SeekFrom::Current(d) => i128::from(self.pos) + i128::from(d),
            SeekFrom::End(d) => match self.len {
                Some(len) => i128::from(len) + i128::from(d),
                None => {
                    return Err(io::Error::new(
                        io::ErrorKind::Unsupported,
                        "stream length unknown",
                    ));
                }
            },
        };
        if target < 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "seek before start",
            ));
        }
        self.pos = target as u64;
        Ok(self.pos)
    }
}

fn open_stream(
    client: &reqwest::blocking::Client,
    url: &str,
) -> Result<(StreamReader, Arc<Shared>), String> {
    let mut response = client
        .get(url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(request_error)?;
    let len = response.content_length();
    let shared = Arc::new(Shared {
        state: Mutex::new(Download {
            bytes: Vec::with_capacity(len.unwrap_or(0) as usize),
            done: false,
            error: None,
        }),
        changed: Condvar::new(),
    });

    let writer = shared.clone();
    thread::spawn(move || {
        let mut chunk = vec![0u8; 64 * 1024];
        loop {
            match response.read(&mut chunk) {
                Ok(0) => return writer.finish(None),
                Ok(n) => {
                    if let Ok(mut state) = writer.state.lock() {
                        state.bytes.extend_from_slice(&chunk[..n]);
                    }
                    writer.changed.notify_all();
                }
                Err(err) => return writer.finish(Some(io_error(err))),
            }
        }
    });

    let reader = StreamReader {
        shared: shared.clone(),
        pos: 0,
        len,
    };
    Ok((reader, shared))
}

struct Current {
    id: u32,
    player: Player,
    stream: Arc<Shared>,
    started: Instant,
    buffered: bool,
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
            detail: scrub(&detail),
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
    let mut current: Option<Current> = None;

    loop {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(Command::Play { id, url, hint }) => {
                emit("command", id, 0.0, "play".into());
                current = None;
                let started = Instant::now();
                let (reader, stream) = match open_stream(&client, &url) {
                    Ok(opened) => opened,
                    Err(err) => {
                        emit("error", id, 0.0, format!("stream: {err}"));
                        continue;
                    }
                };
                let len = reader.len;
                let mut builder = Decoder::builder().with_data(reader).with_gapless(true);
                if let Some(len) = len {
                    builder = builder.with_byte_len(len).with_seekable(true);
                }
                if let Some(hint) = hint.as_deref() {
                    builder = builder.with_hint(hint);
                }
                match builder.build() {
                    Ok(source) => {
                        let duration = source
                            .total_duration()
                            .map(|d| d.as_secs_f64())
                            .unwrap_or(0.0);
                        let player = Player::connect_new(sink.mixer());
                        player.append(source);
                        let wait = started.elapsed().as_secs_f64();
                        emit("started", id, duration, format!("after {wait:.1} s"));
                        current = Some(Current {
                            id,
                            player,
                            stream,
                            started,
                            buffered: false,
                        });
                    }
                    Err(err) => emit("error", id, 0.0, format!("decode: {err}")),
                }
            }
            Ok(command @ (Command::Pause | Command::Resume | Command::Toggle)) => {
                if let Some(cur) = &current {
                    let pause = match command {
                        Command::Pause => true,
                        Command::Resume => false,
                        _ => !cur.player.is_paused(),
                    };
                    if pause {
                        cur.player.pause();
                    } else {
                        cur.player.play();
                    }
                    let kind = if pause { "paused" } else { "resumed" };
                    let pos = cur.player.get_pos().as_secs_f64();
                    emit(kind, cur.id, pos, String::new());
                }
            }
            Ok(Command::Stop) => {
                current = None;
                emit("stopped", 0, 0.0, String::new());
            }
            Err(RecvTimeoutError::Timeout) => {
                let Some(cur) = current.as_mut() else {
                    continue;
                };
                let (done, size, error) = match cur.stream.state.lock() {
                    Ok(state) => (state.done, state.bytes.len(), state.error.clone()),
                    Err(_) => (true, 0, Some("stream lock poisoned".into())),
                };
                if done && !cur.buffered {
                    cur.buffered = true;
                    let secs = cur.started.elapsed().as_secs_f64();
                    let mb = size as f64 / 1_000_000.0;
                    emit(
                        "buffered",
                        cur.id,
                        secs,
                        format!("{mb:.1} MB in {secs:.1} s"),
                    );
                }
                if cur.player.empty() {
                    let id = cur.id;
                    if let Some(err) = error {
                        emit("error", id, 0.0, format!("stream: {err}"));
                    }
                    current = None;
                    emit("ended", id, 0.0, String::new());
                }
            }
            Err(RecvTimeoutError::Disconnected) => return,
        }
    }
}

pub fn fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    let response = reqwest::blocking::Client::new()
        .get(url)
        .send()
        .and_then(|r| r.error_for_status())
        .map_err(request_error)?;
    response.bytes().map(|b| b.to_vec()).map_err(request_error)
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
