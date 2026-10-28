import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { makeSubsonicSong } from '@/test/helpers/factories';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { registerDefaultCoverInvokeHandlers } from '@/test/mocks/tauri';
import PlaylistSongSearchSheet from './PlaylistSongSearchSheet';

const songs = [
  makeSubsonicSong({ id: 's1', title: 'Zombie Ritual', artist: 'Death', album: 'Scream Bloody Gore', duration: 276 }),
  makeSubsonicSong({ id: 's2', title: 'Evil Dead', artist: 'Death', album: 'Scream Bloody Gore', duration: 199 }),
] as SubsonicSong[];

function renderSheet(over: Partial<React.ComponentProps<typeof PlaylistSongSearchSheet>> = {}) {
  registerDefaultCoverInvokeHandlers();
  const props = {
    query: 'death',
    setQuery: vi.fn(),
    searching: false,
    searchResults: songs,
    setSearchResults: vi.fn(),
    addSong: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
  renderWithProviders(<PlaylistSongSearchSheet {...props} />);
  return props;
}

const sheet = () => screen.getByRole('dialog', { name: 'Add Songs' });

describe('PlaylistSongSearchSheet', () => {
  it('one tap on a result adds it to the playlist', () => {
    const props = renderSheet();
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Add to playlist: Evil Dead' }));
    expect(props.addSong).toHaveBeenCalledWith(songs[1]);
    expect(within(sheet()).getAllByText('Death · Scream Bloody Gore', { selector: '.mobile-track__artist' })).toHaveLength(2);
  });

  it('typing searches; the clear button empties the field and the results', () => {
    const props = renderSheet();
    fireEvent.change(within(sheet()).getByRole('searchbox'), { target: { value: 'evil' } });
    expect(props.setQuery).toHaveBeenCalledWith('evil');
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Clear search' }));
    expect(props.setQuery).toHaveBeenCalledWith('');
    expect(props.setSearchResults).toHaveBeenCalledWith([]);
  });

  it('says so when nothing matches', () => {
    renderSheet({ searchResults: [] });
    expect(within(sheet()).getByText('No results.')).toBeInTheDocument();
  });

  it('closing the sheet closes the search', async () => {
    const props = renderSheet();
    fireEvent.click(within(sheet()).getByRole('button', { name: 'Close' }));
    // The sheet slides out before it reports the close.
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
  });
});
