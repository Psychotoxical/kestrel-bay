import { useRef, useState } from 'react';
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PlaylistsHeader from '@/features/playlist/components/PlaylistsHeader';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

function HeaderHarness() {
  const [creating, setCreating] = useState(false);
  const [creatingSmart, setCreatingSmart] = useState(false);
  const [newName, setNewName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <PlaylistsHeader
        selectionMode={false}
        selectedIds={new Set()}
        selectedPlaylists={[]}
        isPlaylistDeletable={() => true}
        toggleSelectionMode={vi.fn()}
        handleDeleteSelected={vi.fn()}
        creating={creating}
        setCreating={setCreating}
        setCreatingSmart={setCreatingSmart}
        newName={newName}
        setNewName={setNewName}
        nameInputRef={nameInputRef}
        handleCreate={vi.fn(async () => {})}
        createServerId="server-a"
        setCreateServerId={vi.fn()}
        createServerOptions={[{ id: 'server-a', label: 'Server A' }]}
        smartCreateServerOptions={[{ id: 'server-a', label: 'Server A' }]}
        setEditingSmartId={vi.fn()}
        setSmartFilters={vi.fn()}
        setGenreQuery={vi.fn()}
        onEditorIntent={vi.fn()}
        foldersEnabled={false}
        ownershipCounts={{ personal: 0, sharedByMe: 0, sharedWithMe: 0 }}
      />
      {creatingSmart && <div data-testid="smart-editor-open" />}
    </>
  );
}

describe('Playlists header in the touch shell', () => {
  it('has the title with sort and "+" beside it, and no desktop button row', () => {
    renderWithProviders(<HeaderHarness />);
    expect(screen.getByRole('heading', { name: 'Playlists' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sort playlists' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Select' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Playlist' })).not.toBeInTheDocument();
  });

  it('"+" offers a new playlist, which opens the name field', () => {
    renderWithProviders(<HeaderHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Playlist' }));
    expect(screen.getByRole('textbox', { name: 'Playlist Name' })).toBeInTheDocument();
  });

  it('"+" offers a new smart playlist', () => {
    renderWithProviders(<HeaderHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'New Smart Playlist' }));
    expect(screen.getByTestId('smart-editor-open')).toBeInTheDocument();
  });
});
