/** Artist track rows take part in the touch multi-selection like every other track row. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { makeSubsonicSong } from '@/test/helpers/factories';
import { useMobileSelectionStore } from '@/features/mobileShell/store/mobileSelectionStore';
import ArtistTrackTouchRow from './ArtistTrackTouchRow';

// The cover loads through the cover cache, which the test does not set up.
vi.mock('@/features/artist/components/ArtistTopTrackCover', () => ({ default: () => null }));

const songs = [makeSubsonicSong({ id: 't1', title: 'One' }), makeSubsonicSong({ id: 't2', title: 'Two' })];

describe('ArtistTrackTouchRow selection', () => {
  beforeEach(() => useMobileSelectionStore.getState().clear());

  it('long press selects, a tap then picks another row instead of playing', () => {
    const onPlay = vi.fn();
    renderWithProviders(
      <ol>
        {songs.map((song, i) => (
          <ArtistTrackTouchRow key={song.id} song={song} index={i} albums={[]} isActive={false} showEq={false} onPlay={onPlay} onMore={vi.fn()} />
        ))}
      </ol>,
    );
    const row = (title: string) => screen.getAllByRole('button', { name: new RegExp(title) }).find(b => !b.hasAttribute('aria-haspopup'))!;
    fireEvent.contextMenu(row('One'));
    fireEvent.click(row('Two'));
    expect(useMobileSelectionStore.getState().selected.map(t => t.id)).toEqual(['t1', 't2']);
    expect(onPlay).not.toHaveBeenCalled();
  });
});
