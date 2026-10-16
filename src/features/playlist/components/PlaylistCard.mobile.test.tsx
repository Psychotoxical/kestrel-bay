import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import { useAuthStore } from '@/store/authStore';
import type { SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import PlaylistCard from './PlaylistCard';

function Location() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

function renderCard() {
  const serverId = useAuthStore.getState().addServer({
    name: 'T', url: 'https://x.test', username: 'tester', password: 'p',
  });
  const pl: SubsonicPlaylist = {
    id: 'pl-1', name: 'Road Trip', songCount: 3, duration: 600, created: '', changed: '', serverId, public: true,
  };
  return renderWithProviders(
    <>
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
      />
      <Location />
    </>,
    { route: '/playlists' },
  );
}

describe('PlaylistCard in the touch shell', () => {
  beforeEach(() => {
    resetAllStores();
    registerDefaultCoverInvokeHandlers();
  });

  // iOS turns the first tap into a hover when it reveals content, which made the
  // card need two taps. Without the hover strip one tap opens the playlist.
  it('has no hover strip, and one tap opens the playlist', async () => {
    const { container } = renderCard();
    expect(container.querySelector('.playlist-card-actions')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByText('Road Trip')); });
    expect(screen.getByTestId('location')).toHaveTextContent('/playlists/pl-1');
  });
});
