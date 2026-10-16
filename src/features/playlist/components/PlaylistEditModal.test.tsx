import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import type { SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import PlaylistEditModal from './PlaylistEditModal';

const PL: SubsonicPlaylist = {
  id: 'pl-1', name: 'Road Trip', songCount: 3, duration: 600, created: '', changed: '', public: true,
};

describe('PlaylistEditModal (desktop)', () => {
  it('stays the centered dialog with the name field focused, and saves', () => {
    const onSave = vi.fn(async () => {});
    renderWithProviders(
      <PlaylistEditModal
        playlist={PL}
        customCoverId={null}
        coverQuadIds={[null, null, null, null]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );
    expect(document.querySelector('.playlist-edit-modal')).not.toBeNull();
    expect(document.querySelector('.mobile-sheet')).toBeNull();
    const name = screen.getByPlaceholderText('Playlist name…');
    expect(name).toHaveFocus();

    fireEvent.change(name, { target: { value: 'Night Drive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      name: 'Night Drive', comment: '', isPublic: true, coverFile: null, coverRemoved: false,
    });
  });
});
