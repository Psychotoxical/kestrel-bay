import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type PlayerEvent = {
  at: number;
  kind: string;
  id: number;
  seconds: number;
  detail: string;
};

const BASE = "https://raw.githubusercontent.com/Psychotoxical/kestrel-bay/main";
const TRACKS = [
  { id: 1, title: "Ton 1 · ein Piep" },
  { id: 2, title: "Ton 2 · zwei Pieps" },
  { id: 3, title: "Ton 3 · drei Pieps" },
];

let running = false;
let index = 0;
let testStart = 0;
let lastBeat = Date.now();
let gaps: { at: number; seconds: number }[] = [];

const $ = (id: string) => document.getElementById(id)!;

function relative(at: number): string {
  if (!testStart) return new Date(at).toLocaleTimeString();
  const s = (at - testStart) / 1000;
  return `${s >= 0 ? "+" : ""}${s.toFixed(1)} s`;
}

function setStatus(text: string) {
  $("status").textContent = text;
}

async function playTrack(i: number) {
  index = (i + TRACKS.length) % TRACKS.length;
  const track = TRACKS[index];
  setStatus(`${track.title} wird geladen …`);
  await invoke("play", { id: track.id, url: `${BASE}/tones/${track.id}.wav` });
}

async function renderLog() {
  const events = await invoke<PlayerEvent[]>("events");
  const list = $("log");
  list.replaceChildren(
    ...events.map((e) => {
      const li = document.createElement("li");
      const what = e.id ? `${e.kind} ${e.id}` : e.kind;
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
  const track = TRACKS.find((t) => t.id === e.id);
  if (e.kind === "started" && track) {
    setStatus(`${track.title} läuft.`);
    await invoke("now_playing", {
      id: track.id,
      title: track.title,
      artist: "Kestrel Bay",
      album: "Testtöne",
      duration: e.seconds,
      coverUrl: `${BASE}/covers/${track.id}.png`,
    });
  }
  if (e.kind === "paused" && track) setStatus(`${track.title} pausiert.`);
  if (e.kind === "resumed" && track) setStatus(`${track.title} läuft.`);
  if (e.kind === "error") setStatus(`Fehler: ${e.detail}`);
  if (e.kind === "ended" && running) await playTrack(index + 1);
  await renderLog();
}

async function onRemote(action: string) {
  if (!running) return;
  if (action === "next") await playTrack(index + 1);
  if (action === "previous") await playTrack(index - 1);
  await renderLog();
}

window.addEventListener("DOMContentLoaded", async () => {
  await listen<PlayerEvent>("kb:event", (event) => onEvent(event.payload));
  await listen<string>("kb:remote", (event) => onRemote(event.payload));

  setInterval(() => {
    const now = Date.now();
    const gap = (now - lastBeat) / 1000;
    if (testStart && gap > 2) {
      gaps.push({ at: lastBeat, seconds: gap });
      renderHeartbeat();
    }
    lastBeat = now;
  }, 1000);

  $("start").addEventListener("click", async () => {
    await invoke("clear_events");
    gaps = [];
    testStart = Date.now();
    lastBeat = testStart;
    running = true;
    renderHeartbeat();
    await playTrack(0);
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
