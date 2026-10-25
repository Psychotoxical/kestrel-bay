import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSafeJSONStorage } from '@/lib/util/safeStorage';

/** A whole library (music folder) the touch shell keeps downloaded. */
export interface PinnedLibrary {
  /** Auth profile id. */
  serverId: string;
  libraryId: string;
  name: string;
  pinnedAt: number;
  /** Tracks in the library at the last pass over it. */
  trackCount: number;
  /** Bytes of the library at the last pass (estimated where the index has no size). */
  totalBytes: number;
  /** Set when the disk filled up; nothing downloads until the user resumes. */
  pausedForSpace?: boolean;
}

interface OfflineLibraryPinState {
  libraries: Record<string, PinnedLibrary>;
  addLibrary: (library: PinnedLibrary) => void;
  removeLibrary: (serverId: string, libraryId: string) => void;
  patchLibrary: (serverId: string, libraryId: string, patch: Partial<PinnedLibrary>) => void;
}

export function pinnedLibraryKey(serverId: string, libraryId: string): string {
  return `${serverId}:${libraryId}`;
}

export const useOfflineLibraryPinStore = create<OfflineLibraryPinState>()(
  persist(
    set => ({
      libraries: {},
      addLibrary: library => set(state => ({
        libraries: {
          ...state.libraries,
          [pinnedLibraryKey(library.serverId, library.libraryId)]: library,
        },
      })),
      removeLibrary: (serverId, libraryId) => set(state => {
        const libraries = { ...state.libraries };
        delete libraries[pinnedLibraryKey(serverId, libraryId)];
        return { libraries };
      }),
      patchLibrary: (serverId, libraryId, patch) => set(state => {
        const key = pinnedLibraryKey(serverId, libraryId);
        const current = state.libraries[key];
        if (!current) return state;
        return { libraries: { ...state.libraries, [key]: { ...current, ...patch } } };
      }),
    }),
    {
      name: 'psysonic-offline-libraries',
      storage: createSafeJSONStorage(),
      partialize: state => ({ libraries: state.libraries }),
    },
  ),
);
