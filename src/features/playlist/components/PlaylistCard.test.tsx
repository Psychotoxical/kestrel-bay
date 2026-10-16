import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { useAuthStore } from '@/store/authStore';
import type { SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import PlaylistCard from './PlaylistCard';

describe('PlaylistCard', () => {
  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
  });

  it('keeps the edit and delete strip on desktop', () => {
    const serverId = useAuthStore.getState().addServer({
      name: 'T', url: 'https://x.test', username: 'tester', password: 'p',
    });
    const pl: SubsonicPlaylist = {
      id: 'pl-1', name: 'Road Trip', songCount: 3, duration: 600, created: '', changed: '', serverId, public: true,
    };
    const { container } = renderWithProviders(
      <PlaylistCard
        pl={pl}
        selectionMode={false}
        selectedIds={new Set()}
        selectedPlaylists={[]}
        toggleSelect={vi.fn()}
        isPlaylistDeletable={() => true}
        deleteConfirmId={null}
        setDeleteConfirmId={vi.fn()}
        handleOpenSmartEditor={vi.fn(async () => {})}
        handleDelete={vi.fn()}
        handlePlay={vi.fn()}
        playingId={null}
        smartCoverIdsByPlaylist={{}}
        pendingSmart={[]}
        filteredSongCountByPlaylist={{}}
        filteredDurationByPlaylist={{}}
      />,
    );
    expect(container.querySelectorAll('.playlist-card-actions .playlist-card-action')).toHaveLength(2);
  });
});
