/**
 * The full track list mounts when its tab opens, usually after the page has
 * been scrolled, and it virtualises against the page's own scroll element.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeSubsonicSong } from '@/test/helpers/factories';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { APP_MAIN_SCROLL_VIEWPORT_ID } from '@/constants/appScroll';
import { useTracklistColumns } from '@/lib/hooks/useTracklistColumns';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import ArtistAllTracksList from '@/features/artist/components/ArtistAllTracksList';
import {
  ARTIST_ALL_TRACKS_COLUMNS,
  ARTIST_ALL_TRACKS_STORAGE_KEY,
} from '@/features/artist/utils/artistAllTracksColumns';

function List({ songs }: { songs: SubsonicSong[] }) {
  const columns = useTracklistColumns(ARTIST_ALL_TRACKS_COLUMNS, ARTIST_ALL_TRACKS_STORAGE_KEY);
  return <ArtistAllTracksList songs={songs} loading={false} failed={false} onPlay={() => {}} columns={columns} />;
}

const songs = Array.from({ length: 30 }, (_, i) => makeSubsonicSong({ id: `t${i}`, title: `Track ${i}` }));

describe('ArtistAllTracksList on a scrolled page', () => {
  let viewport: HTMLDivElement;
  let scrollTo: ReturnType<typeof vi.fn>;
  let offsetSpy: MockInstance;

  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
    viewport = document.createElement('div');
    viewport.id = APP_MAIN_SCROLL_VIEWPORT_ID;
    Object.defineProperty(viewport, 'scrollTop', { configurable: true, writable: true, value: 600 });
    scrollTo = vi.fn();
    viewport.scrollTo = scrollTo as unknown as typeof viewport.scrollTo;
    document.body.appendChild(viewport);
    // jsdom has no layout; give the page viewport a height so the virtualiser attaches and renders.
    offsetSpy = vi
      .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.id === APP_MAIN_SCROLL_VIEWPORT_ID ? 800 : 48;
      });
  });

  afterEach(() => {
    offsetSpy.mockRestore();
    viewport.remove();
  });

  it('keeps the page where it is when the list mounts', () => {
    renderWithProviders(<List songs={songs} />);
    const targets = scrollTo.mock.calls.map(([options]) => (options as ScrollToOptions).top);
    // The virtualiser writes its offset into the page's scroll element on attach;
    // that write has to be the page's own position, not a fresh 0.
    expect(targets.length).toBeGreaterThan(0);
    expect(targets).toEqual(targets.map(() => 600));
  });
});
