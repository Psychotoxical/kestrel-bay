/**
 * ⚠️ Android territory. The web view's half of Android Auto (`src-tauri/android/
 * PsysonicAutoService.kt`): the car asks for a list by node, gets the same lists CarPlay
 * shows (`mobileShell/car/carplayContent`), plays a row by node, and voice requests
 * ("Play … on Psysonic") go through the same matching as Siri (`mobileShell/car/siriPlay`).
 * The player's shuffle, repeat, favourite and infinite queue buttons work as in CarPlay.
 */
import { carPlayCommand, carPlayList, carPlayPlay, carPlayState, watchCarSongTabs, type CarPlayList } from '@/features/mobileShell/car/carplayContent';
import { usePlayerStore } from '@/features/playback';
import { useAuthStore } from '@/store/authStore';
import { playSiriRequest, type SiriPlayRequest } from '@/features/mobileShell/car/siriPlay';
import i18n from '@/lib/i18n';
import { IS_ANDROID } from '@/lib/util/platform';

interface AndroidAutoHost {
  carListResult(id: number, json: string): void;
  /** Older app builds lack it. */
  setCarState?(json: string): void;
  /** Tells the car to ask for its lists again (it kept the "open the app" list). */
  carListsReady?(): void;
  /** Tells the car these lists changed (JSON array of nodes). Older app builds lack it. */
  carListsChanged?(nodesJson: string): void;
}

declare global {
  interface Window {
    __psyAutoList?: (id: number, node: string) => void;
    __psyAutoPlay?: (node: string) => void;
    __psyAutoSearch?: (request: AutoSearchRequest) => void;
    __psyAutoCommand?: (action: string) => void;
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

/** Albums per cover row in Android Auto; the rest is behind "show all". */
const AUTO_COVER_ROW_SIZE = 8;

/** One car list as the native side reads it: sections of rows, covers as file paths. */
export async function carListJson(node: string): Promise<string> {
  const list: CarPlayList = await carPlayList(node).catch(() => ({ sections: [] }));
  // Covers not on disk yet: once they are, the car asks for the list again and gets them
  // (it showed rows without covers until the list was opened anew, car test 21.10.).
  if (list.refreshCovers) {
    let fetched = false;
    void list.refreshCovers(() => { fetched = true; })
      .catch(() => {})
      .then(() => { if (fetched) host()?.carListsChanged?.(JSON.stringify([node])); });
  }
  return JSON.stringify({
    sections: list.sections.map(section => ({
      header: section.header ?? '',
      // A cover row becomes a grid of tiles; its header link becomes a last "show all" tile.
      grid: !!section.more,
      items: [
        ...(section.more ? section.items.slice(0, AUTO_COVER_ROW_SIZE) : section.items).map(item => ({
          node: item.node,
          title: item.title,
          subtitle: item.subtitle ?? '',
          browse: item.browse,
          image: item.image ?? '',
        })),
        ...(section.more
          ? [{ node: section.more, title: i18n.t('carPlay.showAll'), subtitle: '', browse: true, image: '' }]
          : []),
      ],
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
  // The player's shuffle, repeat, favourite and infinite queue buttons, as in CarPlay.
  window.__psyAutoCommand = action => carPlayCommand(action);
  let lastState = '';
  const pushState = () => {
    const { shuffle, repeat, starred, infinite } = carPlayState();
    const json = JSON.stringify({ shuffle, repeat, starred, infinite });
    if (json === lastState) return;
    lastState = json;
    host()?.setCarState?.(json);
  };
  const offPlayer = usePlayerStore.subscribe(pushState);
  const offAuth = useAuthStore.subscribe(pushState);
  const offSongTabs = watchCarSongTabs(nodes => host()?.carListsChanged?.(JSON.stringify(nodes)));
  pushState();
  host()?.carListsReady?.();
  return () => {
    offPlayer();
    offAuth();
    offSongTabs();
    delete window.__psyAutoList;
    delete window.__psyAutoPlay;
    delete window.__psyAutoSearch;
    delete window.__psyAutoCommand;
  };
}
