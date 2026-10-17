import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { makeSubsonicSong } from '@/test/helpers/factories';
import FavoriteSongTouchRow from './FavoriteSongTouchRow';

const song = makeSubsonicSong({ id: 's1', title: 'Souls of Death', artist: 'Fail', albumId: 'al1', duration: 245 });

/** The row's main button (the other one is "…"). */
const row = () => screen.getAllByRole('button')[0];

function setup(overrides: Partial<React.ComponentProps<typeof FavoriteSongTouchRow>> = {}) {
  const props = { song, index: 2, isActive: false, showEq: false, onPlay: vi.fn(), onMore: vi.fn(), ...overrides };
  renderWithProviders(<FavoriteSongTouchRow {...props} />);
  return props;
}

describe('FavoriteSongTouchRow', () => {
  it('reads number, title over artist and duration', () => {
    setup();
    expect(row()).toHaveTextContent('3');
    expect(row()).toHaveTextContent('Souls of Death');
    expect(row()).toHaveTextContent('Fail');
    expect(row()).toHaveTextContent('4:05');
  });

  it('tapping plays from this row', () => {
    const props = setup();
    fireEvent.click(row());
    expect(props.onPlay).toHaveBeenCalledWith(2);
  });

  it('the "…" button opens the song menu', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'More options: Souls of Death' }));
    expect(props.onMore).toHaveBeenCalledWith(song, expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it('marks the playing song', () => {
    setup({ isActive: true, showEq: true });
    expect(row()).toHaveAttribute('aria-current', 'true');
  });
});
