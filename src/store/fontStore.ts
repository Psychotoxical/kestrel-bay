import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

/** `system` exists only in the touch shell: the platform's own UI font. */
export type FontId = 'system' | 'inter' | 'outfit' | 'dm-sans' | 'nunito' | 'rubik' | 'space-grotesk' | 'figtree' | 'manrope' | 'plus-jakarta-sans' | 'lexend' | 'geist' | 'jetbrains-mono' | 'golos-text' | 'unbounded' | 'opendyslexic';

interface FontState {
  font: FontId;
  setFont: (font: FontId) => void;
  uiScale: number;
  setUiScale: (scale: number) => void;
}

export const useFontStore = create<FontState>()(
  persist(
    (set) => ({
      font: IS_MOBILE_SHELL ? 'system' : 'lexend',
      setFont: (font) => set({ font }),
      uiScale: 1.0,
      setUiScale: (uiScale) => set({ uiScale }),
    }),
    {
      name: 'psysonic_font',
      // The desktop has no system font option; one a touch backup brought along
      // falls back to the desktop default.
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<FontState>) };
        return !IS_MOBILE_SHELL && state.font === 'system' ? { ...state, font: 'lexend' } : state;
      },
    }
  )
);
