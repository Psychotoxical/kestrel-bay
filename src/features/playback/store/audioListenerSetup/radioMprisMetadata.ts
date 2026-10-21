import { mprisSetMetadata } from '@/lib/api/mpris';
import { radioCoverUrlForMpris } from '@/cover/integrations/mpris';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';
import { listen } from '@tauri-apps/api/event';
import { usePlayerStore } from '@/features/playback/store/playerStore';

/**
 * Radio ICY StreamTitle → MPRIS. The Rust download task emits "radio:metadata"
 * with { title, is_ad } every time an ICY metadata block changes (typically
 * every 8–32 KB of audio). Forward each update to mpris_set_metadata so the OS
 * now-playing overlay stays in sync while the stream is live. Returns a cleanup
 * function.
 */
export function setupRadioMprisMetadata(): () => void {
  const radioMetaUnlisten = listen<{ title: string; is_ad: boolean }>('radio:metadata', ({ payload }) => {
    const { currentRadio } = usePlayerStore.getState();
    if (!currentRadio) return; // guard: only forward during active radio session
    if (payload.is_ad) return; // skip CDN-injected ad metadata

    // Parse "Artist - Title" convention used by most ICY streams.
    const sep = payload.title.indexOf(' - ');
    const artist = sep !== -1 ? payload.title.slice(0, sep).trim() : null;
    const title  = sep !== -1 ? payload.title.slice(sep + 3).trim() : payload.title;

    const push = (coverUrl: string | null) => mprisSetMetadata({
      title: title || currentRadio.name,
      artist: artist || currentRadio.name,
      album: null,
      coverUrl,
      durationSecs: null,
    }).catch(() => {});
    if (IS_MOBILE_SHELL) {
      void radioCoverUrlForMpris(currentRadio).then(coverUrl => {
        if (usePlayerStore.getState().currentRadio?.id === currentRadio.id) void push(coverUrl);
      });
    } else {
      void push(null);
    }
  });

  return () => {
    radioMetaUnlisten.then(unlisten => unlisten());
  };
}
