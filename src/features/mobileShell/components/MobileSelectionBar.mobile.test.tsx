/** The selection's chrome: count, cancel, and the actions on the picked tracks. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { usePlayerStore } from '@/features/playback/store/playerStore';
import type { Track } from '@/lib/media/trackTypes';
import MobileSelectionBar, { MOBILE_SELECTING_ATTR } from './MobileSelectionBar';
import { useMobileSelectionStore } from '../store/mobileSelectionStore';

const track = (id: string, serverId = 'srv') => ({ id, title: id, artist: 'A', album: 'B', albumId: 'al', duration: 1, serverId }) as Track;

describe('MobileSelectionBar', () => {
  beforeEach(() => {
    useMobileSelectionStore.getState().clear();
  });

  it('shows nothing without a selection', () => {
    renderWithProviders(<MobileSelectionBar />);
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(document.documentElement.hasAttribute(MOBILE_SELECTING_ATTR)).toBe(false);
  });

  it('shows the count and swaps the bottom bars while tracks are selected', () => {
    renderWithProviders(<MobileSelectionBar />);
    act(() => { useMobileSelectionStore.getState().start(track('a')); useMobileSelectionStore.getState().toggle(track('b')); });
    expect(screen.getByText('2 tracks selected')).toBeInTheDocument();
    expect(document.documentElement.hasAttribute(MOBILE_SELECTING_ATTR)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useMobileSelectionStore.getState().selected).toEqual([]);
    expect(document.documentElement.hasAttribute(MOBILE_SELECTING_ATTR)).toBe(false);
  });

  it('play next and add to queue take the picked tracks in picking order, then end the selection', () => {
    const playNext = vi.fn();
    const enqueue = vi.fn();
    usePlayerStore.setState({ playNext, enqueue });
    renderWithProviders(<MobileSelectionBar />);
    act(() => { useMobileSelectionStore.getState().start(track('b')); useMobileSelectionStore.getState().toggle(track('a')); });
    fireEvent.click(screen.getByRole('button', { name: /Play Next/ }));
    expect(playNext.mock.calls[0][0].map((t: Track) => t.id)).toEqual(['b', 'a']);
    expect(useMobileSelectionStore.getState().selected).toEqual([]);

    act(() => { useMobileSelectionStore.getState().start(track('c')); });
    fireEvent.click(screen.getByRole('button', { name: /Add to Queue/ }));
    expect(enqueue.mock.calls[0][0].map((t: Track) => t.id)).toEqual(['c']);
  });

  it('a selection across servers cannot go to one playlist', () => {
    renderWithProviders(<MobileSelectionBar />);
    act(() => { useMobileSelectionStore.getState().start(track('a', 's1')); useMobileSelectionStore.getState().toggle(track('b', 's2')); });
    expect(screen.getByRole('button', { name: /Add to Playlist/ })).toBeDisabled();
  });
});
