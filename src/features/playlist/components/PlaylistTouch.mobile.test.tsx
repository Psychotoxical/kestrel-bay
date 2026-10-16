import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SubsonicPlaylist, SubsonicSong } from '@/lib/api/subsonicTypes';
import { offlineActionPolicy } from '@/features/offline';
import PlaylistHero from '@/features/playlist/components/PlaylistHero';
import PlaylistTouchRow from '@/features/playlist/components/PlaylistTouchRow';
import type { PlaylistRowCallbacks } from '@/features/playlist/components/PlaylistRow';
import { usePlaylistLayoutStore } from '@/features/playlist/store/playlistLayoutStore';
import { makeSubsonicSong } from '@/test/helpers/factories';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';

const song = makeSubsonicSong({ id: 's1', title: 'Zombie Ritual', artist: 'Death', duration: 276 });

function callbacks(): PlaylistRowCallbacks {
  return {
    activate: vi.fn(), doubleClick: vi.fn(), context: vi.fn(), mouseDownRow: vi.fn(),
    mouseEnterRow: vi.fn(), toggleSelect: vi.fn(), play: vi.fn(), startPreview: vi.fn(),
    toggleStar: vi.fn(), rate: vi.fn(), remove: vi.fn(), navAlbum: vi.fn(),
  };
}

const playlist: SubsonicPlaylist = {
  id: 'pl-1', name: 'Death', songCount: 1, duration: 276, created: '', changed: '', serverId: 'srv-a', public: true,
};

function renderHero(over: { handleShuffleAll?: () => void; handleEnqueueAll?: () => void } = {}) {
  return renderWithProviders(
    <PlaylistHero
      playlist={playlist}
      songs={[song as SubsonicSong]}
      id={playlist.id}
      customCoverId={null}
      coverQuadIds={[null, null, null, null]}
      resolvedBgUrl={null}
      saving={false}
      refreshingSmart={false}
      searchOpen={false}
      csvImporting={false}
      activeZip={undefined}
      offlineStatus="none"
      offlineProgress={null}
      activeServerId="srv-a"
      actionPolicy={offlineActionPolicy('playlistDetail', false)}
      setEditingMeta={vi.fn()}
      setSearchOpen={vi.fn()}
      setSearchQuery={vi.fn()}
      setSearchResults={vi.fn()}
      setSelectedSearchIds={vi.fn()}
      setSearchPlPickerOpen={vi.fn()}
      handlePlayAll={vi.fn()}
      handleShuffleAll={over.handleShuffleAll ?? vi.fn()}
      handleEnqueueAll={over.handleEnqueueAll ?? vi.fn()}
      handleImportCsv={vi.fn()}
      handleDownload={vi.fn()}
      handleRefreshSmart={vi.fn()}
      deleteAlbum={vi.fn()}
      downloadPlaylist={vi.fn()}
    />,
  );
}

describe('playlist page in the touch shell', () => {
  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
    usePlaylistLayoutStore.getState().reset();
  });

  it('a row shows title, artist and duration; tapping it plays that position', () => {
    const cb = callbacks();
    renderWithProviders(<PlaylistTouchRow song={song} index={3} realIdx={5} isActive={false} showEq={false} cb={cb} />);
    expect(screen.getByText('Death')).toBeInTheDocument();
    expect(screen.getByText('4:36')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Zombie Ritual'));
    expect(cb.play).toHaveBeenCalledWith(3);
  });

  it('the more button opens the row menu at the button, with the source index for removal', () => {
    const cb = callbacks();
    renderWithProviders(<PlaylistTouchRow song={song} index={3} realIdx={5} isActive={false} showEq={false} cb={cb} />);
    fireEvent.click(screen.getByRole('button', { name: 'More options: Zombie Ritual' }));
    expect(cb.context).toHaveBeenCalledWith(song, 5, expect.anything(), { x: expect.any(Number), y: expect.any(Number) });
  });

  it('the header has play and shuffle as big buttons, the other actions in the "…" menu', () => {
    const handleShuffleAll = vi.fn();
    const { container } = renderHero({ handleShuffleAll });
    fireEvent.click(screen.getByRole('button', { name: /^Shuffle$/ }));
    expect(handleShuffleAll).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1 song · 5m · Public')).toBeInTheDocument();
    // No action chips on the page: the configured actions wait behind "…".
    expect(container.querySelector('.mobile-playlist .mobile-chip-row .btn')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Add to Queue/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('menuitem', { name: /Add to Queue/ })).toBeInTheDocument();
    // Shuffle is a big button here, so the menu must not repeat it.
    expect(screen.queryByRole('menuitem', { name: /Shuffle/ })).toBeNull();
  });

  it('a menu entry runs its action and closes the menu', () => {
    const handleEnqueueAll = vi.fn();
    renderHero({ handleEnqueueAll });
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Add to Queue/ }));
    expect(handleEnqueueAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
