import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type PlayerEvent = {
  at: number;
  kind: string;
  id: number;
  detail: string;
};

const TONE_BASE = "https://raw.githubusercontent.com/Psychotoxical/kestrel-bay/main/tones";
const TRACKS = [1, 2, 3];

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
  index = i;
  setStatus(`Ton ${TRACKS[i]} wird geladen …`);
  await invoke("play", { id: TRACKS[i], url: `${TONE_BASE}/${TRACKS[i]}.wav` });
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
  if (e.kind === "started") setStatus(`Ton ${e.id} läuft.`);
  if (e.kind === "error") setStatus(`Fehler: ${e.detail}`);
  if (e.kind === "ended" && running) {
    if (index + 1 < TRACKS.length) {
      await playTrack(index + 1);
    } else {
      running = false;
      setStatus("Fertig. Alle drei Töne gespielt.");
    }
  }
  await renderLog();
}

window.addEventListener("DOMContentLoaded", async () => {
  await listen<PlayerEvent>("kb:event", (event) => onEvent(event.payload));

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
