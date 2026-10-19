/** In "Change order" a playlist row shows a grip; taps and long presses do nothing then. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { makeSubsonicSong } from '@/test/helpers/factories';
import { useMobileSelectionStore } from '@/features/mobileShell/store/mobileSelectionStore';
import type { PlaylistRowCallbacks } from './PlaylistRow';
import PlaylistTouchRow from './PlaylistTouchRow';

const song = makeSubsonicSong({ id: 's1', title: 'Holy Diver' });

function setup(reordering: boolean) {
  const cb = { play: vi.fn(), context: vi.fn() } as unknown as PlaylistRowCallbacks;
  renderWithProviders(<PlaylistTouchRow song={song} index={0} realIdx={0} isActive={false} showEq={false} cb={cb} reordering={reordering} />);
  return cb;
}

describe('PlaylistTouchRow in change-order mode', () => {
  beforeEach(() => useMobileSelectionStore.getState().clear());

  it('shows the grip instead of the menu', () => {
    setup(true);
    expect(screen.getByRole('button', { name: 'Move: Holy Diver' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /More options/ })).toBeNull();
  });

  it('a tap does not play and a long press does not start a selection', () => {
    const cb = setup(true);
    const main = screen.getAllByRole('button')[0];
    fireEvent.click(main);
    fireEvent.contextMenu(main);
    expect(cb.play).not.toHaveBeenCalled();
    expect(useMobileSelectionStore.getState().selected).toEqual([]);
  });

  it('outside the mode the row plays and keeps its menu', () => {
    const cb = setup(false);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(cb.play).toHaveBeenCalledWith(0);
    expect(screen.getByRole('button', { name: /More options/ })).toBeInTheDocument();
  });
});
