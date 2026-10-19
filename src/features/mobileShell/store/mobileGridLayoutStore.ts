import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** How many covers sit side by side, or the metadata list. More per row is for the iPad layout, later. */
export type MobileGridLayout = 2 | 3 | 'list';

/** Touch pages that carry the layout switch. */
export type MobileGridSurface = 'albums' | 'new-releases';

export const DEFAULT_MOBILE_GRID_LAYOUT: MobileGridLayout = 2;
export const MOBILE_GRID_LAYOUTS: readonly MobileGridLayout[] = [2, 3, 'list'];

const SURFACES: readonly MobileGridSurface[] = ['albums', 'new-releases'];

export function isMobileGridLayout(value: unknown): value is MobileGridLayout {
  return value === 2 || value === 3 || value === 'list';
}

/**
 * Keeps only known surfaces with known layouts. Persisted state outlives the code that
 * wrote it, so a renamed page or a dropped option must not leave a page without a layout.
 */
export function sanitizeMobileGridLayouts(
  value: unknown,
): Partial<Record<MobileGridSurface, MobileGridLayout>> {
  if (!value || typeof value !== 'object') return {};
  const source = value as Record<string, unknown>;
  const out: Partial<Record<MobileGridSurface, MobileGridLayout>> = {};
  for (const surface of SURFACES) {
    const layout = source[surface];
    if (isMobileGridLayout(layout)) out[surface] = layout;
  }
  return out;
}

interface MobileGridLayoutStore {
  /** Per-page layout; a missing entry means the default. */
  layoutBySurface: Partial<Record<MobileGridSurface, MobileGridLayout>>;
  setLayout: (surface: MobileGridSurface, layout: MobileGridLayout) => void;
}

export const useMobileGridLayoutStore = create<MobileGridLayoutStore>()(
  persist(
    set => ({
      layoutBySurface: {},
      setLayout: (surface, layout) =>
        set(s => ({ layoutBySurface: { ...s.layoutBySurface, [surface]: layout } })),
    }),
    {
      name: 'psysonic_mobile_grid_layout',
      version: 1,
      merge: (persistedState, currentState) => ({
        ...currentState,
        layoutBySurface: sanitizeMobileGridLayouts(
          (persistedState as { layoutBySurface?: unknown } | undefined)?.layoutBySurface,
        ),
      }),
    },
  ),
);

/** One page's layout; `columns` is undefined for the list, so a grid never forces one. */
export function useMobileGridLayout(surface: MobileGridSurface): {
  layout: MobileGridLayout;
  columns: number | undefined;
  isList: boolean;
} {
  const layout = useMobileGridLayoutStore(s => s.layoutBySurface[surface] ?? DEFAULT_MOBILE_GRID_LAYOUT);
  return { layout, columns: layout === 'list' ? undefined : layout, isList: layout === 'list' };
}
