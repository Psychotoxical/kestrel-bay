import { create } from 'zustand';

interface HomeRefreshState {
  /** Bumped per manual refresh; Home loads a fresh feed and shows it at once. */
  token: number;
  /** A manual refresh is in flight (drives the pull-to-refresh spinner). */
  refreshing: boolean;
  request: () => void;
  finish: () => void;
}

/**
 * Manual Mainstage refresh (touch pull-to-refresh). Without it, a visit shows
 * the cached feed and only prepares the next one in the background.
 */
export const useHomeRefreshStore = create<HomeRefreshState>()(set => ({
  token: 0,
  refreshing: false,
  request: () => set(s => ({ token: s.token + 1, refreshing: true })),
  finish: () => set({ refreshing: false }),
}));
