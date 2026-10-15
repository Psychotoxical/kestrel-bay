import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

type Account = { server: string; user: string };

type Metrics = {
  atMs: number;
  cpuSeconds: number;
  maxRssMb: number;
  battery: number | null;
  libraryBytes: number;
  walBytes: number;
  clusterBytes: number;
};

type SyncStatus = {
  syncPhase: string;
  serverTrackCount: number | null;
  localTrackCount: number | null;
  ingestStrategy: string | null;
};

type ProgressPayload = {
  serverId: string;
  kind: string;
  phase?: string | null;
  ingestedTotal?: number | null;
  message?: string | null;
};

type IdlePayload = {
  serverId: string;
  kind: string;
  jobId?: string | null;
  ok: boolean;
  error?: string | null;
};

type Run = {
  serverId: string;
  jobId?: string;
  t0: number;
  tBind?: number;
  tCompleted?: number;
  m0: Metrics;
  total?: number;
  ingested: number;
  phase: string;
  phases: { name: string; at: number }[];
  error?: string;
};

let run: Run | null = null;

const $ = (id: string) => document.getElementById(id)!;

/** Same key Psysonic derives from a server URL: no scheme, no trailing slash. */
function indexKey(server: string): string {
  return server.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
const megabytes = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;

function renderProgress() {
  if (!run) return;
  const elapsed = Date.now() - run.t0;
  const total = run.total ? ` / ${run.total.toLocaleString("de-DE")}` : "";
  const rate = elapsed > 0 ? Math.round(run.ingested / (elapsed / 1000)) : 0;
  $("index-progress").textContent =
    `${run.phase} · ${run.ingested.toLocaleString("de-DE")}${total} Songs · ${seconds(elapsed)} · ${rate} Songs/s`;
}

function renderResult(lines: string[]) {
  $("index-result").replaceChildren(
    ...lines.map((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      return li;
    }),
  );
}

async function finish(ok: boolean, error?: string | null) {
  if (!run) return;
  const current = run;
  run = null;
  const tEnd = Date.now();
  const m1 = await invoke<Metrics>("metrics");
  await invoke("keep_awake", { on: false });
  let count = 0;
  let status: SyncStatus | null = null;
  try {
    count = await invoke<number>("library_count_live_tracks", { serverId: current.serverId });
    status = await invoke<SyncStatus>("library_get_status", {
      serverId: current.serverId,
      libraryScope: null,
    });
  } catch {
    // The numbers below stay at their defaults.
  }

  const wall = tEnd - current.t0;
  const cpu = m1.cpuSeconds - current.m0.cpuSeconds;
  const lines = [
    ok && !error ? "Ergebnis: fertig" : `Ergebnis: Fehler – ${error ?? current.error ?? "unbekannt"}`,
    `Dauer gesamt: ${seconds(wall)}`,
  ];
  if (current.tBind) lines.push(`  Anmeldung + Server-Prüfung: ${seconds(current.tBind - current.t0)}`);
  if (current.tBind && current.tCompleted) {
    lines.push(`  Songs laden: ${seconds(current.tCompleted - current.tBind)}`);
    lines.push(`  Nacharbeit (Tags, Identität): ${seconds(tEnd - current.tCompleted)}`);
  }
  lines.push(
    `Songs im Index: ${count.toLocaleString("de-DE")}${current.total ? ` von ${current.total.toLocaleString("de-DE")}` : ""}`,
    `Tempo: ${Math.round(count / (wall / 1000))} Songs/s`,
    `Verfahren: ${status?.ingestStrategy ?? "?"}`,
    `Index auf dem Gerät: ${megabytes(m1.libraryBytes + m1.walBytes + m1.clusterBytes)} (Haupt ${megabytes(m1.libraryBytes)}, WAL ${megabytes(m1.walBytes)}, Cluster ${megabytes(m1.clusterBytes)})`,
    `Rechenzeit: ${cpu.toFixed(1)} s (${Math.round((cpu / (wall / 1000)) * 100)} % eines Kerns)`,
    `Speicher (Höchststand): ${m1.maxRssMb.toFixed(0)} MB`,
  );
  if (current.m0.battery !== null && m1.battery !== null) {
    lines.push(`Akku: ${current.m0.battery.toFixed(0)} % → ${m1.battery.toFixed(0)} %`);
  }
  for (const p of current.phases) lines.push(`Phase „${p.name}“ ab ${seconds(p.at - current.t0)}`);
  renderResult(lines);
  $("index-progress").textContent = ok && !error ? "Fertig." : "Abgebrochen.";
}

export async function setupIndexTest(getAccount: () => Account | null) {
  await listen<ProgressPayload>("library:sync-progress", (event) => {
    const p = event.payload;
    if (!run || p.serverId !== run.serverId) return;
    if (p.phase && p.phase !== run.phase) {
      run.phase = p.phase;
      run.phases.push({ name: p.phase, at: Date.now() });
    }
    if (typeof p.ingestedTotal === "number") run.ingested = p.ingestedTotal;
    if (p.kind === "completed") run.tCompleted = Date.now();
    if (p.kind === "error") run.error = p.message ?? "error";
    renderProgress();
  });

  await listen<IdlePayload>("library:sync-idle", (event) => {
    const p = event.payload;
    if (!run || !run.jobId || p.jobId !== run.jobId) return;
    void finish(p.ok, p.error);
  });

  setInterval(renderProgress, 1000);

  $("index-start").addEventListener("click", async () => {
    const account = getAccount();
    const input = $("index-password") as HTMLInputElement;
    if (!account) {
      $("index-progress").textContent = "Erst oben mit Navidrome verbinden.";
      return;
    }
    if (run) return;
    const password = input.value;
    if (!password) {
      $("index-progress").textContent = "Bitte das Passwort eintragen.";
      return;
    }
    input.value = "";
    renderResult([]);

    const serverId = indexKey(account.server);
    await invoke("keep_awake", { on: true });
    const m0 = await invoke<Metrics>("metrics");
    run = { serverId, t0: Date.now(), m0, ingested: 0, phase: "Anmeldung", phases: [] };
    renderProgress();
    try {
      await invoke("library_sync_bind_session", {
        serverId,
        baseUrl: account.server,
        username: account.user,
        password,
        libraryScope: null,
      });
      run.tBind = Date.now();
      const status = await invoke<SyncStatus>("library_get_status", { serverId, libraryScope: null });
      run.total = status.serverTrackCount ?? undefined;
      run.phase = "Start";
      const job = await invoke<{ jobId: string }>("library_sync_start", {
        serverId,
        mode: "full",
        libraryScope: null,
      });
      run.jobId = job.jobId;
      renderProgress();
    } catch (err) {
      await finish(false, String(err));
    }
  });

  $("index-cancel").addEventListener("click", async () => {
    if (!run?.jobId) return;
    await invoke("library_sync_cancel", { jobId: run.jobId });
  });
}
