/**
 * ⚠️ Android territory. The web view's half of Android Auto (`src-tauri/android/
 * PsysonicAutoService.kt`): the car asks for a list by node, gets the same lists CarPlay
 * shows (`mobileShell/car/carplayContent`), plays a row by node, and voice requests
 * ("Play … on Psysonic") go through the same matching as Siri (`mobileShell/car/siriPlay`).
 */
import { carPlayList, carPlayPlay } from '@/features/mobileShell/car/carplayContent';
import { playSiriRequest, type SiriPlayRequest } from '@/features/mobileShell/car/siriPlay';
import { IS_ANDROID } from '@/lib/util/platform';

interface AndroidAutoHost {
  carListResult(id: number, json: string): void;
}

declare global {
  interface Window {
    __psyAutoList?: (id: number, node: string) => void;
    __psyAutoPlay?: (node: string) => void;
    __psyAutoSearch?: (request: AutoSearchRequest) => void;
  }
}

/**
 * A voice request from the car (`onPlayFromSearch`): the spoken text and what the assistant
 * made of it. `focus` is `MediaStore.EXTRA_MEDIA_FOCUS`, empty for free text.
 */
export interface AutoSearchRequest {
  query: string;
  focus?: string;
  title?: string;
  artist?: string;
  album?: string;
  playlist?: string;
}

/** `INMediaItemType` values the Siri matching understands. */
const FOCUS_TYPES: Record<string, number> = {
  'vnd.android.cursor.item/audio': 1,
  'vnd.android.cursor.item/album': 2,
  'vnd.android.cursor.item/artist': 3,
  'vnd.android.cursor.item/playlist': 5,
};

/** The car's request in the shape Siri hands over, so both go through the same matching. */
export function autoSearchToSiri(request: AutoSearchRequest): SiriPlayRequest {
  const mediaType = FOCUS_TYPES[request.focus ?? ''] ?? 0;
  const named = mediaType === 5 ? request.playlist
    : mediaType === 3 ? request.artist
    : mediaType === 2 ? request.album
    : request.title;
  return {
    mediaName: named || request.query,
    artistName: request.artist || null,
    albumName: request.album || null,
    mediaType,
  };
}

function host(): AndroidAutoHost | undefined {
  return (window as unknown as { PsysonicAndroidMedia?: AndroidAutoHost }).PsysonicAndroidMedia;
}

/** One car list as the native side reads it: sections of rows, covers as file paths. */
export async function carListJson(node: string): Promise<string> {
  const list = await carPlayList(node).catch(() => ({ sections: [] }));
  return JSON.stringify({
    sections: list.sections.map(section => ({
      header: section.header ?? '',
      items: section.items.map(item => ({
        node: item.node,
        title: item.title,
        subtitle: item.subtitle ?? '',
        browse: item.browse,
        image: item.image ?? '',
      })),
    })),
  });
}

/** Answers the car; returns the cleanup. */
export function installAndroidAuto(): () => void {
  if (!IS_ANDROID) return () => {};
  window.__psyAutoList = (id, node) => {
    void carListJson(node).then(json => host()?.carListResult(id, json));
  };
  window.__psyAutoPlay = node => { void carPlayPlay(node); };
  window.__psyAutoSearch = request => {
    void playSiriRequest(autoSearchToSiri(request)).catch(() => {});
  };
  return () => {
    delete window.__psyAutoList;
    delete window.__psyAutoPlay;
    delete window.__psyAutoSearch;
  };
}
