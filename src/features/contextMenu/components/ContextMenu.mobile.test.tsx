/**
 * Touch shell: a menu opened with `placeAbove` (the player's "…" button) ends just
 * above its anchor, so the button stays visible and tappable; when the space above is
 * too small the menu shrinks and scrolls instead of covering the anchor.
 */
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/orbit/utils/orbitBulkGuard', () => ({
  orbitBulkGuard: vi.fn(async () => true),
}));
vi.mock('@/features/offline/hooks/useOfflineBrowseContext', () => ({
  useOfflineBrowseContext: () => ({
    active: false,
    serverId: 'srv-1',
    capabilities: { localLibrary: false, favorites: false, playlists: false, manualPins: false, playerStats: false },
    hasBrowseCapability: false,
    hasBrowsingContent: false,
    connStatus: 'connected' as const,
  }),
}));

import ContextMenu from '@/features/contextMenu/components/ContextMenu';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeTrack } from '@/test/helpers/factories';

const realRect = Element.prototype.getBoundingClientRect;

/** jsdom has no layout: give the menu a measured size. */
function measureMenuAs(width: number, height: number) {
  Element.prototype.getBoundingClientRect = function rect(this: Element) {
    if (this.classList?.contains('context-menu')) {
      return { x: 0, y: 0, left: 0, top: 0, right: width, bottom: height, width, height, toJSON: () => ({}) } as DOMRect;
    }
    return realRect.call(this);
  };
}

function openAbove(y: number) {
  act(() => {
    usePlayerStore.getState().openContextMenu(
      380, y, makeTrack(), 'song', undefined, undefined, undefined, undefined, true, undefined, undefined, true,
    );
  });
}

describe('ContextMenu above its anchor (touch shell)', () => {
  beforeEach(() => resetAllStores());
  afterEach(() => { Element.prototype.getBoundingClientRect = realRect; });

  it('ends just above the anchor and keeps its natural height when it fits', () => {
    measureMenuAs(220, 300);
    const { container } = renderWithProviders(<ContextMenu />);
    openAbove(900);
    const menu = container.ownerDocument.querySelector('.context-menu') as HTMLElement;
    expect(menu.style.top).toBe(`${900 - 8 - 300}px`);
    expect(menu.style.maxHeight).toBe('');
  });

  it('shrinks and scrolls instead of covering the anchor when the space above is short', () => {
    measureMenuAs(220, 900);
    const { container } = renderWithProviders(<ContextMenu />);
    openAbove(500);
    const menu = container.ownerDocument.querySelector('.context-menu') as HTMLElement;
    // 500 - 8 (gap) - 64 (status bar) = 428 px of room, ending 8 px above the anchor.
    expect(menu.style.maxHeight).toBe('428px');
    expect(menu.style.top).toBe('64px');
    expect(menu.style.overflowY).toBe('auto');
  });
});
