import { usePlayerStore } from '@/features/playback/store/playerStore';

/**
 * On the iPhone the volume buttons set how loud the app plays, and the touch shell has no
 * volume slider of its own. The player's own level therefore stays at full: otherwise it
 * would keep the desktop default (80 %) or a level left over from a fade, and play quieter
 * than other apps at the same system volume.
 */
export function pinFullAppVolume(): void {
  const { volume, setVolume } = usePlayerStore.getState();
  if (volume < 1) setVolume(1);
}
