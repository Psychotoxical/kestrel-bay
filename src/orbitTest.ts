import { listen } from "@tauri-apps/api/event";

/**
 * Mimics Orbit's cadence from the UI side: a server request every 2.5 s (host push /
 * guest poll) and a heartbeat every 10 s, both from JS timers like Orbit's hooks.
 */
const TICK_MS = 2500;
const HEARTBEAT_MS = 10_000;

type Request = { at: number; ms: number; ok: boolean; error?: string };

type Run = {
  t0: number;
  ticks: number[];
  heartbeats: number[];
  requests: Request[];
  progress: number[];
  hidden: { from: number; to?: number }[];
  timers: number[];
};

let run: Run | null = null;

const $ = (id: string) => document.getElementById(id)!;
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

function inHidden(at: number, r: Run): boolean {
  return r.hidden.some((h) => at >= h.from && at <= (h.to ?? Date.now()));
}

function hiddenMs(r: Run, end: number): number {
  return r.hidden.reduce((sum, h) => sum + ((h.to ?? end) - h.from), 0);
}

function maxGap(times: number[]): number {
  let max = 0;
  for (let i = 1; i < times.length; i++) max = Math.max(max, times[i] - times[i - 1]);
  return max;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function render(r: Run, end: number) {
  const wall = end - r.t0;
  const locked = hiddenMs(r, end);
  const lockedTicks = r.ticks.filter((t) => inHidden(t, r));
  const lockedRequests = r.requests.filter((q) => inHidden(q.at, r));
  const lockedProgress = r.progress.filter((t) => inHidden(t, r));
  const lockedBeats = r.heartbeats.filter((t) => inHidden(t, r));
  const failures = r.requests.filter((q) => !q.ok);
  const lines = [
    `Laufzeit: ${seconds(wall)}, davon gesperrt/im Hintergrund: ${seconds(locked)}`,
    `Takt 2,5 s gesamt: ${r.ticks.length} von ~${Math.floor(wall / TICK_MS)} erwartet, längste Lücke ${seconds(maxGap([r.t0, ...r.ticks, end]))}`,
    `Takt 2,5 s gesperrt: ${lockedTicks.length} von ~${Math.floor(locked / TICK_MS)} erwartet, längste Lücke ${seconds(maxGap(lockedTicks))}`,
    `Lebenszeichen 10 s gesperrt: ${lockedBeats.length} von ~${Math.floor(locked / HEARTBEAT_MS)} erwartet`,
    `Server-Anfragen: ${r.requests.length - failures.length} ok, ${failures.length} Fehler, Median ${Math.round(median(r.requests.map((q) => q.ms)))} ms`,
    `Server-Anfragen gesperrt: ${lockedRequests.filter((q) => q.ok).length} ok, ${lockedRequests.filter((q) => !q.ok).length} Fehler`,
    `Fortschrittsmeldungen aus Rust gesperrt: ${lockedProgress.length} (erwartet ~${Math.floor(locked / 1500)} bei laufender Musik)`,
  ];
  if (failures.length) lines.push(`Erster Fehler: ${failures[0].error ?? "?"}`);
  $("orbit-result").replaceChildren(
    ...lines.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );
}

async function request(r: Run, url: string | null) {
  const at = Date.now();
  if (!url) {
    r.requests.push({ at, ms: 0, ok: false, error: "nicht verbunden" });
    return;
  }
  try {
    const response = await fetch(url, { cache: "no-store" });
    const ok = response.ok && (await response.text()).includes('"status":"ok"');
    r.requests.push({ at, ms: Date.now() - at, ok, error: ok ? undefined : `HTTP ${response.status}` });
  } catch (err) {
    r.requests.push({ at, ms: Date.now() - at, ok: false, error: String(err) });
  }
}

export async function setupOrbitTest(makeUrl: (endpoint: string) => string | null) {
  await listen("kb:progress", () => {
    run?.progress.push(Date.now());
  });

  document.addEventListener("visibilitychange", () => {
    if (!run) return;
    const now = Date.now();
    if (document.visibilityState === "hidden") run.hidden.push({ from: now });
    else {
      const open = run.hidden[run.hidden.length - 1];
      if (open && open.to === undefined) open.to = now;
      render(run, now);
    }
  });

  $("orbit-start").addEventListener("click", () => {
    if (run) return;
    const r: Run = { t0: Date.now(), ticks: [], heartbeats: [], requests: [], progress: [], hidden: [], timers: [] };
    r.timers.push(
      window.setInterval(() => {
        r.ticks.push(Date.now());
        void request(r, makeUrl("getPlaylists"));
      }, TICK_MS),
      window.setInterval(() => {
        r.heartbeats.push(Date.now());
        void request(r, makeUrl("ping"));
      }, HEARTBEAT_MS),
    );
    run = r;
    $("orbit-status").textContent = "Läuft. Jetzt sperren, ca. 2 Minuten warten, entsperren, dann Stopp.";
    $("orbit-result").replaceChildren();
  });

  $("orbit-stop").addEventListener("click", () => {
    if (!run) return;
    const r = run;
    run = null;
    r.timers.forEach((id) => window.clearInterval(id));
    const end = Date.now();
    const open = r.hidden[r.hidden.length - 1];
    if (open && open.to === undefined) open.to = end;
    render(r, end);
    $("orbit-status").textContent = "Gestoppt.";
  });
}
