import { useEffect } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { usePlayerStore } from '@/features/playback';
import { useAuthStore } from '@/store/authStore';
import {
  carPlayCommand,
  carPlayList,
  carPlayPlay,
  carPlayState,
  type CarPlayState,
} from '@/features/mobileShell/car/carplayContent';

interface ListRequest {
  requestId: number;
  node: string;
}

interface PlayRequest {
  node: string;
}

interface CommandRequest {
  action: string;
}

const sameState = (a: CarPlayState, b: CarPlayState) =>
  a.shuffle === b.shuffle && a.repeat === b.repeat && a.starred === b.starred && a.infinite === b.infinite && a.hasTrack === b.hasTrack
  && a.upNextTitle === b.upNextTitle && a.albumTitle === b.albumTitle;

async function answerList({ requestId, node }: ListRequest): Promise<void> {
  const list = await carPlayList(node).catch(() => ({ sections: [] }));
  const { refreshCovers, ...sent } = list as Awaited<ReturnType<typeof carPlayList>>;
  await emit('carplay:list-result', { requestId, ...sent });
  if (!refreshCovers) return;
  const images = await refreshCovers().catch(() => []);
  if (images.length > 0) await emit('carplay:list-images', { requestId, images });
}

/**
 * iOS CarPlay: the native scene (`src-tauri/src/ios/carplay.rs`) shows Apple's templates and asks
 * this layer for every list (`carplay:list`), play (`carplay:play`) and now-playing
 * button (`carplay:command`). Covers missing on disk follow the list
 * (`carplay:list-images`); the buttons' state is pushed as it changes
 * (`carplay:state`). Once listening it reports `carplay:ready`, so requests made
 * during a cold start from the car are sent again.
 */
export function useCarPlayBridge(): void {
  useEffect(() => {
    let cancelled = false;
    const unlisten: Array<() => void> = [];
    let lastState = carPlayState();

    const setup = async () => {
      const offList = await listen<ListRequest>('carplay:list', ({ payload }) => {
        void answerList(payload);
      });
      if (cancelled) { offList(); return; }
      unlisten.push(offList);

      const offPlay = await listen<PlayRequest>('carplay:play', ({ payload }) => {
        void carPlayPlay(payload.node).catch(() => {});
      });
      if (cancelled) { offPlay(); return; }
      unlisten.push(offPlay);

      const offCommand = await listen<CommandRequest>('carplay:command', ({ payload }) => {
        carPlayCommand(payload.action);
      });
      if (cancelled) { offCommand(); return; }
      unlisten.push(offCommand);

      const pushState = () => {
        const next = carPlayState();
        if (sameState(next, lastState)) return;
        lastState = next;
        void emit('carplay:state', next);
      };
      unlisten.push(usePlayerStore.subscribe(pushState));
      unlisten.push(useAuthStore.subscribe(pushState));

      await emit('carplay:state', lastState);
      await emit('carplay:ready');
    };
    void setup();

    return () => {
      cancelled = true;
      unlisten.forEach(off => off());
    };
  }, []);
}
