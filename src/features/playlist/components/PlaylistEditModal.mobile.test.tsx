import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import type { SubsonicPlaylist } from '@/lib/api/subsonicTypes';
import PlaylistEditModal from './PlaylistEditModal';

const PL: SubsonicPlaylist = {
  id: 'pl-1', name: 'Road Trip', songCount: 3, duration: 600, created: '', changed: '', public: false,
};

function renderSheet(onSave = vi.fn(async () => {})) {
  renderWithProviders(
    <PlaylistEditModal
      playlist={PL}
      customCoverId={null}
      coverQuadIds={[null, null, null, null]}
      onClose={vi.fn()}
      onSave={onSave}
    />,
  );
  return onSave;
}

describe('PlaylistEditModal (touch shell)', () => {
  it('opens as a sheet, not the desktop dialog, and keeps the keyboard down', () => {
    renderSheet();
    expect(screen.getByRole('dialog', { name: 'Edit playlist' })).toBeInTheDocument();
    expect(document.querySelector('.playlist-edit-modal')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Playlist name…' })).not.toHaveFocus();
  });

  it('saves name, description and the public switch', () => {
    const onSave = renderSheet();
    fireEvent.change(screen.getByRole('textbox', { name: 'Playlist name…' }), { target: { value: 'Night Drive' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Add a description…' }), { target: { value: 'Slow songs' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Public playlist' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      name: 'Night Drive', comment: 'Slow songs', isPublic: true, coverFile: null, coverRemoved: false,
    });
  });

  it('cannot save without a name', () => {
    renderSheet();
    fireEvent.change(screen.getByRole('textbox', { name: 'Playlist name…' }), { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
