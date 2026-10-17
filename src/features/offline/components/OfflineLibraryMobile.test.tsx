import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { useConfirmModalStore } from '@/store/confirmModalStore';
import type { OfflineLibraryCard } from '@/features/offline/utils/offlineLibraryHelpers';
import OfflineLibraryMobile from './OfflineLibraryMobile';

const ALBUM: OfflineLibraryCard = {
  serverIndexKey: 'srv', pinSource: { kind: 'album', sourceId: 'al-1' }, trackIds: ['t1'],
  name: 'Taken by Storm', artist: 'Stormwind',
};
const PLAYLIST: OfflineLibraryCard = {
  serverIndexKey: 'srv', pinSource: { kind: 'playlist', sourceId: 'pl-1' }, trackIds: ['t2'],
  name: 'Road Trip', artist: '',
};

function Location() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function setup(props: Partial<React.ComponentProps<typeof OfflineLibraryMobile>> = {}) {
  const onDelete = vi.fn();
  renderWithProviders(
    <>
      <OfflineLibraryMobile
        cards={[ALBUM, PLAYLIST]}
        loading={false}
        totalBytes={1024 * 1024 * 1024}
        favoritesTrackCount={0}
        onDelete={onDelete}
        {...props}
      />
      <Location />
    </>,
    { route: '/offline' },
  );
  return { onDelete };
}

describe('OfflineLibraryMobile', () => {
  afterEach(() => { useConfirmModalStore.getState().cancel(); });

  it('lists the downloads under the space they take', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Downloaded' })).toBeInTheDocument();
    expect(screen.getByText('1.00 GB on this device')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Taken by Storm/ })).toHaveTextContent('Stormwind');
    expect(screen.getByRole('button', { name: /Road Trip/ })).toHaveTextContent('Playlist');
  });

  it('tapping a row opens the album or the playlist', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Taken by Storm/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/album/al-1?server=srv');
    fireEvent.click(screen.getByRole('button', { name: /Road Trip/ }));
    expect(screen.getByTestId('location')).toHaveTextContent('/playlists/pl-1?server=srv');
  });

  it('a long press asks before it removes the download', async () => {
    const { onDelete } = setup();
    fireEvent.contextMenu(screen.getByRole('button', { name: /Taken by Storm/ }));
    expect(useConfirmModalStore.getState()).toMatchObject({ isOpen: true, title: 'Remove download?' });
    expect(onDelete).not.toHaveBeenCalled();
    useConfirmModalStore.getState().confirm();
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledWith(ALBUM));
  });

  it('filters by kind once there is more than one', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Playlists' }));
    expect(screen.queryByRole('button', { name: /Taken by Storm/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Road Trip/ })).toBeInTheDocument();
  });

  it('explains how to download when nothing is there', () => {
    setup({ cards: [], totalBytes: 0 });
    expect(screen.getByText(/Nothing downloaded yet/)).toBeInTheDocument();
    expect(screen.queryByText(/on this device/)).not.toBeInTheDocument();
  });
});
