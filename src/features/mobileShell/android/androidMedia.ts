/**
 * ⚠️ Android territory. The web view's half of the Android media bridge
 * (`src-tauri/android/PsysonicMedia.kt`): what plays goes to the native MediaSession
 * (lock screen, media notification, headset buttons, foreground service), and its buttons
 * come back as the same `media:*` events the desktop and iOS controls send, so every rule
 * those follow (Orbit guests, previews) applies unchanged.
 */
import { emit } from '@tauri-apps/api/event';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { RADIO_STARTING_EVENT } from '@/features/playback/store/radioPlayer';
import { IS_ANDROID } from '@/lib/util/platform';

/** Injected by `PsysonicMedia.attach` (Android only). */
interface AndroidMediaHost {
  setMetadata(json: string): void;
  setPlayback(playing: boolean, positionSecs: number): void;
  /** Older app builds lack it. */
  setRadio?(radio: boolean): void;
}

declare global {
  interface Window {
    PsysonicAndroidMedia?: AndroidMediaHost;
    __psyAndroidMediaCommand?: (name: string, seconds: number) => void;
  }
}

function host(): AndroidMediaHost | undefined {
  return IS_ANDROID ? window.PsysonicAndroidMedia : undefined;
}

/** Only a cover file from the app's own cache: a remote cover URL carries the server login. */
export function coverPathFromUrl(coverUrl: string | null | undefined): string | null {
  if (!coverUrl?.startsWith('file://')) return null;
  try {
    return decodeURI(coverUrl.slice('file://'.length));
  } catch {
    return null;
  }
}

export function androidMediaSetMetadata(args: {
  title: string | null;
  artist: string | null;
  album: string | null;
  coverUrl?: string | null;
  durationSecs: number | null;
}): void {
  host()?.setMetadata(JSON.stringify({
    title: args.title ?? '',
    artist: args.artist ?? '',
    album: args.album ?? '',
    coverPath: coverPathFromUrl(args.coverUrl) ?? '',
    durationSecs: args.durationSecs ?? 0,
  }));
}

export function androidMediaSetPlayback(args: { playing: boolean; positionSecs: number | null }): void {
  host()?.setPlayback(args.playing, args.positionSecs ?? 0);
}

const COMMAND_EVENTS: Record<string, string> = {
  play: 'media:play',
  pause: 'media:pause',
  next: 'media:next',
  prev: 'media:prev',
};

/** Native buttons → the shared `media:*` events. Returns the cleanup. */
export function installAndroidMediaCommands(): () => void {
  window.__psyAndroidMediaCommand = (name, seconds) => {
    if (name === 'seek') {
      void emit('media:seek-absolute', seconds);
      return;
    }
    const event = COMMAND_EVENTS[name];
    if (event) void emit(event);
  };
  // Radio plays through the web view's own audio element, which asks for audio focus
  // itself: the native side must not answer that loss of focus with a pause.
  let radio = usePlayerStore.getState().currentRadio !== null;
  host()?.setRadio?.(radio);
  const offRadio = usePlayerStore.subscribe((state, prev) => {
    // Only a station change or a stop: other updates arrive while a station is starting.
    if (state.currentRadio === prev.currentRadio && (state.isPlaying || !prev.isPlaying)) return;
    const next = state.currentRadio !== null;
    if (next === radio) return;
    radio = next;
    host()?.setRadio?.(radio);
  });
  // A station is starting: its focus request comes before `currentRadio` is set.
  const onRadioStarting = () => {
    radio = true;
    host()?.setRadio?.(true);
  };
  window.addEventListener(RADIO_STARTING_EVENT, onRadioStarting);
  return () => {
    offRadio();
    window.removeEventListener(RADIO_STARTING_EVENT, onRadioStarting);
    delete window.__psyAndroidMediaCommand;
  };
}
