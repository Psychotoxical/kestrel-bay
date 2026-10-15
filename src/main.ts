import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type PlayerEvent = {
  at: number;
  kind: string;
  id: number;
  seconds: number;
  detail: string;
};

type Song = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  suffix: string;
  bitRate: number;
  coverArt: string;
};

type Item = {
  title: string;
  artist: string;
  album: string;
  url: string;
  cover: string;
  hint: string;
};

type Account = { server: string; user: string; salt: string; token: string };

const BASE = "https://raw.githubusercontent.com/Psychotoxical/kestrel-bay/main";
const ACCOUNT_KEY = "kestrel-bay.account";
const TONES: Item[] = [1, 2, 3].map((n) => ({
  title: `Ton ${n} · ${["ein Piep", "zwei Pieps", "drei Pieps"][n - 1]}`,
  artist: "Kestrel Bay",
  album: "Testtöne",
  url: `${BASE}/tones/${n}.wav`,
  cover: `${BASE}/covers/${n}.png`,
  hint: "wav",
}));

let queue: Item[] = [];
let index = 0;
let seq = 0;
const bySeq = new Map<number, Item>();
let running = false;
let testStart = 0;
let lastBeat = Date.now();
let gaps: { at: number; seconds: number }[] = [];
let account: Account | null = null;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function loadAccount(): Account | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as Account) : null;
  } catch {
    return null;
  }
}

function saveAccount(value: Account | null) {
  try {
    if (value) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(value));
    else localStorage.removeItem(ACCOUNT_KEY);
  } catch {
    // Without storage the login just lasts for this session.
  }
}

function apiUrl(endpoint: string, params: Record<string, string>): string {
  if (!account) throw new Error("not connected");
  const query = new URLSearchParams({
    u: account.user,
    t: account.token,
    s: account.salt,
    v: "1.16.1",
    c: "kestrelbay",
    ...params,
  });
  return `${account.server}/rest/${endpoint}.view?${query}`;
}

function relative(at: number): string {
  if (!testStart) return new Date(at).toLocaleTimeString();
  const s = (at - testStart) / 1000;
  return `${s >= 0 ? "+" : ""}${s.toFixed(1)} s`;
}

function setStatus(text: string) {
  $("status").textContent = text;
}

function startQueue(items: Item[], at: number) {
  queue = items;
  running = true;
  if (!testStart) {
    testStart = Date.now();
    lastBeat = testStart;
  }
  playIndex(at);
}

async function playIndex(i: number) {
  index = (i + queue.length) % queue.length;
  const item = queue[index];
  seq += 1;
  bySeq.set(seq, item);
  setStatus(`${item.title} wird geladen …`);
  await invoke("play", { id: seq, url: item.url, hint: item.hint });
}

async function renderLog() {
  const events = await invoke<PlayerEvent[]>("events");
  $("log").replaceChildren(
    ...events.map((e) => {
      const li = document.createElement("li");
      const item = bySeq.get(e.id);
      const what = item ? `${e.kind} „${item.title}“` : e.kind;
      li.textContent = `${relative(e.at)}  ${what}${e.detail ? ` – ${e.detail}` : ""}`;
      if (e.kind === "error") li.className = "error";
      if (e.kind === "remote") li.className = "remote";
      return li;
    }),
  );
}

function renderHeartbeat() {
  if (!gaps.length) {
    $("heartbeat").textContent = testStart ? "Keine Aussetzer über 2 s." : "–";
    return;
  }
  $("heartbeat").textContent = gaps
    .map((g) => `Aussetzer ${g.seconds.toFixed(1)} s bei ${relative(g.at)}`)
    .join(" · ");
}

async function onEvent(e: PlayerEvent) {
  const item = bySeq.get(e.id);
  if (e.kind === "started" && item) {
    setStatus(`${item.title} läuft.`);
    await invoke("now_playing", {
      id: e.id,
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration: e.seconds,
      coverUrl: item.cover,
    });
  }
  if (e.kind === "paused" && item) setStatus(`${item.title} pausiert.`);
  if (e.kind === "resumed" && item) setStatus(`${item.title} läuft.`);
  if (e.kind === "error") setStatus(`Fehler: ${e.detail}`);
  if (e.kind === "ended" && running && e.id === seq) await playIndex(index + 1);
  await renderLog();
}

async function onRemote(action: string) {
  if (!running || !queue.length) return;
  if (action === "next") await playIndex(index + 1);
  if (action === "previous") await playIndex(index - 1);
  await renderLog();
}

function songItem(song: Song, format: string): Item {
  const stream =
    format === "mp3"
      ? apiUrl("stream", { id: song.id, format: "mp3", maxBitRate: "320" })
      : apiUrl("stream", { id: song.id, format: "raw" });
  return {
    title: song.title,
    artist: song.artist,
    album: song.album,
    url: stream,
    cover: apiUrl("getCoverArt", { id: song.coverArt || song.id, size: "600" }),
    hint: format === "mp3" ? "mp3" : song.suffix,
  };
}

function renderAccount() {
  $("login").hidden = !!account;
  $("connected").hidden = !account;
  if (account) {
    let host = account.server;
    try {
      host = new URL(account.server).host;
    } catch {
      // Keep the raw value.
    }
    $("account").textContent = `Verbunden als ${account.user} auf ${host}`;
  }
}

async function loadSongs() {
  if (!account) return;
  setStatus("Lade Songs …");
  try {
    const songs = await invoke<Song[]>("random_songs", { ...account, size: 20 });
    $("songs").replaceChildren(
      ...songs.map((song, i) => {
        const li = document.createElement("li");
        const title = document.createElement("strong");
        title.textContent = song.title;
        const meta = document.createElement("span");
        const minutes = `${Math.floor(song.duration / 60)}:${String(song.duration % 60).padStart(2, "0")}`;
        meta.textContent = `${song.artist} · ${song.suffix.toUpperCase()} ${song.bitRate} kbps · ${minutes}`;
        li.append(title, meta);
        li.addEventListener("click", () => {
          const format = $<HTMLSelectElement>("format").value;
          startQueue(
            songs.map((s) => songItem(s, format)),
            i,
          );
        });
        return li;
      }),
    );
    setStatus(`${songs.length} Songs geladen. Antippen zum Abspielen.`);
  } catch (err) {
    setStatus(`Fehler: ${err}`);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  await listen<PlayerEvent>("kb:event", (event) => onEvent(event.payload));
  await listen<string>("kb:remote", (event) => onRemote(event.payload));

  account = loadAccount();
  renderAccount();

  setInterval(() => {
    const now = Date.now();
    const gap = (now - lastBeat) / 1000;
    if (testStart && gap > 2) {
      gaps.push({ at: lastBeat, seconds: gap });
      renderHeartbeat();
    }
    lastBeat = now;
  }, 1000);

  $("login").addEventListener("submit", async (event) => {
    event.preventDefault();
    const server = $<HTMLInputElement>("server").value.trim().replace(/\/+$/, "");
    const user = $<HTMLInputElement>("user").value.trim();
    const passwordInput = $<HTMLInputElement>("password");
    if (!server || !user || !passwordInput.value) {
      setStatus("Bitte Server, Benutzer und Passwort eintragen.");
      return;
    }
    const { salt, token } = await invoke<{ salt: string; token: string }>("make_token", {
      password: passwordInput.value,
    });
    passwordInput.value = "";
    account = { server, user, salt, token };
    try {
      await invoke<Song[]>("random_songs", { ...account, size: 1 });
    } catch (err) {
      account = null;
      setStatus(`Verbindung fehlgeschlagen: ${err}`);
      return;
    }
    saveAccount(account);
    renderAccount();
    setStatus("Verbunden.");
    await loadSongs();
  });

  $("logout").addEventListener("click", async () => {
    account = null;
    saveAccount(null);
    $("songs").replaceChildren();
    renderAccount();
    setStatus("Abgemeldet.");
  });

  $("load").addEventListener("click", () => loadSongs());

  $("tones").addEventListener("click", async () => {
    await invoke("clear_events");
    gaps = [];
    testStart = Date.now();
    lastBeat = testStart;
    renderHeartbeat();
    startQueue(TONES, 0);
  });

  $("toggle").addEventListener("click", () => invoke("toggle"));

  $("stop").addEventListener("click", async () => {
    running = false;
    await invoke("stop");
    setStatus("Gestoppt.");
  });

  $("refresh").addEventListener("click", () => {
    renderLog();
    renderHeartbeat();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      renderLog();
      renderHeartbeat();
    }
  });

  await renderLog();
});
