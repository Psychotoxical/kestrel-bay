/** Long press starts a multi-selection; while it runs a tap picks rows instead of playing. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { makeSubsonicSong } from '@/test/helpers/factories';
import MobileSongRow from './MobileSongRow';
import { useMobileSelectionStore } from '../store/mobileSelectionStore';

const songs = [
  makeSubsonicSong({ id: 's1', title: 'One', serverId: 'srv' }),
  makeSubsonicSong({ id: 's2', title: 'Two', serverId: 'srv' }),
];

function setup() {
  const onPlay = vi.fn();
  renderWithProviders(
    <>
      {songs.map((song, i) => (
        <MobileSongRow key={song.id} song={song} index={i} isActive={false} showEq={false} onPlay={onPlay} onMore={vi.fn()} />
      ))}
    </>,
  );
  const row = (title: string) => screen.getAllByRole('button', { name: new RegExp(title) }).find(b => !b.hasAttribute('aria-haspopup'))!;
  return { onPlay, row };
}

const selectedIds = () => useMobileSelectionStore.getState().selected.map(t => t.id);

describe('MobileSongRow selection', () => {
  beforeEach(() => useMobileSelectionStore.getState().clear());

  it('a long press (contextmenu) selects the row without playing it', () => {
    const { onPlay, row } = setup();
    fireEvent.contextMenu(row('One'));
    expect(selectedIds()).toEqual(['s1']);
    expect(onPlay).not.toHaveBeenCalled();
    expect(row('One')).toHaveAttribute('aria-pressed', 'true');
    expect(row('Two')).toHaveAttribute('aria-pressed', 'false');
  });

  it('while selecting, a tap adds or removes a row instead of playing', () => {
    const { onPlay, row } = setup();
    fireEvent.contextMenu(row('One'));
    fireEvent.click(row('Two'));
    expect(selectedIds()).toEqual(['s1', 's2']);
    fireEvent.click(row('One'));
    expect(selectedIds()).toEqual(['s2']);
    expect(onPlay).not.toHaveBeenCalled();
  });

  it('removing the last row ends the selection, and a tap plays again', () => {
    const { onPlay, row } = setup();
    fireEvent.contextMenu(row('One'));
    fireEvent.click(row('One'));
    expect(selectedIds()).toEqual([]);
    fireEvent.click(row('Two'));
    expect(onPlay).toHaveBeenCalledWith(1);
  });
});
