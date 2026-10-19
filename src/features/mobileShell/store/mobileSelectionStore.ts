import { create } from 'zustand';
import type { Track } from '@/lib/media/trackTypes';
import { ownedEntityKey } from '@/lib/util/ownedEntityKey';

/**
 * Touch multi-selection of tracks: a long press on a track row starts it, taps then add
 * or remove rows, and the shell shows the action bar while anything is selected. Tracks
 * keep the order they were picked in.
 */
interface MobileSelectionStore {
  selected: Track[];
  /** Starts a selection with this track, or adds it to the running one. */
  start: (track: Track) => void;
  /** Adds or removes the track; removing the last one ends the selection. */
  toggle: (track: Track) => void;
  clear: () => void;
}

export const useMobileSelectionStore = create<MobileSelectionStore>()(set => ({
  selected: [],
  start: track =>
    set(s => {
      const key = ownedEntityKey(track);
      return s.selected.some(t => ownedEntityKey(t) === key) ? s : { selected: [...s.selected, track] };
    }),
  toggle: track =>
    set(s => {
      const key = ownedEntityKey(track);
      const without = s.selected.filter(t => ownedEntityKey(t) !== key);
      return { selected: without.length === s.selected.length ? [...s.selected, track] : without };
    }),
  clear: () => set({ selected: [] }),
}));

/** For a track row: whether a selection runs, whether this row is in it, and the two gestures. */
export function useMobileTrackSelection(track: Track): {
  selecting: boolean;
  selected: boolean;
  start: () => void;
  toggle: () => void;
} {
  const key = ownedEntityKey(track);
  const selecting = useMobileSelectionStore(s => s.selected.length > 0);
  const selected = useMobileSelectionStore(s => s.selected.some(t => ownedEntityKey(t) === key));
  const startTrack = useMobileSelectionStore(s => s.start);
  const toggleTrack = useMobileSelectionStore(s => s.toggle);
  return { selecting, selected, start: () => startTrack(track), toggle: () => toggleTrack(track) };
}
