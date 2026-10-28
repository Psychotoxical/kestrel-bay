/**
 * ⚠️ Android territory. The web view's half of the music alarm (`src-tauri/android/
 * PsysonicAlarm.kt`): every change to the alarms goes to the native side, which sets them
 * in the system; when one rings, the native side calls `__psyAlarmRing`, this starts its
 * music and the ringing screen shows; Snooze and Stop go back to the native side, which
 * also handles them from the notification (`__psyAlarmDismissed`).
 */
import { carPlayPlay } from '@/features/mobileShell/car/carplayContent';
import { usePlayerStore } from '@/features/playback';
import { resolvePlaylistTracks } from '@/features/playlist/utils/resolvePlaylistTracks';
import { playPlaylistAll, shufflePlaylistAll } from '@/features/playlist/utils/playlistBulkPlayActions';
import { frontendDebugLog } from '@/lib/api/debugLog';
import { IS_ANDROID } from '@/lib/util/platform';
import { sanitizeAlarms, useAlarmStore, type Alarm } from './alarmStore';

export interface AlarmStatus {
  notifications: boolean;
  fullScreen: boolean;
  exact: boolean;
  battery: boolean;
  /** May open over other apps: the alarm then also opens while the phone is in use. */
  overlay: boolean;
}

interface AndroidAlarmHost {
  setAlarms(json: string): void;
  takeDisabled(): string;
  ready(): void;
  musicStarted(): void;
  dismiss(snooze: boolean): void;
  status(): string;
  fix(what: keyof AlarmStatus): void;
}

declare global {
  interface Window {
    PsysonicAndroidAlarm?: AndroidAlarmHost;
    __psyAlarmRing?: (json: string) => void;
    __psyAlarmDismissed?: (snooze: boolean) => void;
  }
}

function host(): AndroidAlarmHost | undefined {
  return IS_ANDROID ? window.PsysonicAndroidAlarm : undefined;
}

export function alarmStatus(): AlarmStatus | null {
  try {
    const raw = host()?.status();
    return raw ? JSON.parse(raw) as AlarmStatus : null;
  } catch {
    return null;
  }
}

export function fixAlarmStatus(what: keyof AlarmStatus): void {
  host()?.fix(what);
}

export function dismissAlarm(snooze: boolean): void {
  useAlarmStore.getState().setRinging(null);
  host()?.dismiss(snooze);
}

/** Starts what the alarm plays; the shuffle choice applies to playlists. */
export async function playAlarmSource(alarm: Alarm): Promise<void> {
  const source = alarm.source;
  switch (source.kind) {
    case 'luckymix': return carPlayPlay('luckymix');
    case 'random': return carPlayPlay('random');
    case 'favorites': return carPlayPlay('favplay');
    case 'playlist': {
      const tracks = await resolvePlaylistTracks(source.id, source.serverId);
      const { playTrack, enqueue } = usePlayerStore.getState();
      const deps = { songsLength: tracks.length, id: source.id, serverId: source.serverId, tracks, playTrack, enqueue };
      if (alarm.shuffle) shufflePlaylistAll(deps); else playPlaylistAll(deps);
      return;
    }
  }
}

/** How long the music may take before the native side's ringtone stands in (it waits 25 s). */
const MUSIC_WAIT_MS = 30_000;

/** Tells the native side once music plays, so the ringtone stays off. */
function reportMusicStarted(): void {
  const done = () => { off(); clearTimeout(timer); };
  const check = () => {
    if (!usePlayerStore.getState().isPlaying) return;
    done();
    host()?.musicStarted();
  };
  const off = usePlayerStore.subscribe(check);
  const timer = setTimeout(done, MUSIC_WAIT_MS);
  check();
}

function onRing(json: string): void {
  const [alarm] = sanitizeAlarms([JSON.parse(json)]);
  if (!alarm) return;
  frontendDebugLog('alarm', JSON.stringify({ step: 'ring', id: alarm.id, source: alarm.source.kind }));
  useAlarmStore.getState().setRinging(alarm);
  // Already playing (a snooze ended mid-song, say): carry on instead of starting over.
  if (usePlayerStore.getState().isPlaying) {
    host()?.musicStarted();
    return;
  }
  reportMusicStarted();
  const start = (step: string) => {
    if (useAlarmStore.getState().ringing?.id !== alarm.id || usePlayerStore.getState().isPlaying) return;
    frontendDebugLog('alarm', JSON.stringify({ step, id: alarm.id }));
    void playAlarmSource(alarm).catch(error => {
      frontendDebugLog('alarm', JSON.stringify({ step: 'play-failed', error: String(error) }));
    });
  };
  // Opened by the alarm itself: the page puts the last song back (paused) in its first
  // seconds, which replaced the alarm's music when it started at once (S22, 21.10.).
  setTimeout(() => start('play'), Math.max(0, STARTUP_SETTLE_MS - performance.now()));
  setTimeout(() => start('play-again'), Math.max(0, STARTUP_SETTLE_MS - performance.now()) + RETRY_MS);
}

/** Page age before the alarm's music starts; a page that runs longer starts it at once. */
const STARTUP_SETTLE_MS = 6000;
/** Second try when nothing plays by then; the ringtone follows 25 s after the alarm. */
const RETRY_MS = 8000;

/** Wires the store to the native side. Returns the cleanup. */
/**
 * The alarm is off (alarmAvailability): the alarms an older build set in the system are
 * withdrawn, so none rings without its screen. The alarms themselves stay in the page's
 * storage for when the alarm comes back. Returns the (empty) cleanup.
 */
export function retireAndroidAlarms(): () => void {
  host()?.setAlarms('[]');
  return () => {};
}

export function installAndroidAlarm(): () => void {
  const alarmHost = host();
  if (!alarmHost) return () => {};

  // One-time alarms that rang while the page was not there turned themselves off natively.
  try {
    const disabled = JSON.parse(alarmHost.takeDisabled()) as string[];
    for (const id of disabled) useAlarmStore.getState().setEnabled(id, false);
  } catch { /* nothing turned off */ }

  let sent = '';
  const push = () => {
    const json = JSON.stringify(useAlarmStore.getState().alarms);
    if (json === sent) return;
    sent = json;
    alarmHost.setAlarms(json);
  };
  const off = useAlarmStore.subscribe(push);
  push();

  window.__psyAlarmRing = json => { try { onRing(json); } catch { /* malformed */ } };
  window.__psyAlarmDismissed = () => { useAlarmStore.getState().setRinging(null); };
  alarmHost.ready();

  return () => {
    off();
    delete window.__psyAlarmRing;
    delete window.__psyAlarmDismissed;
  };
}
