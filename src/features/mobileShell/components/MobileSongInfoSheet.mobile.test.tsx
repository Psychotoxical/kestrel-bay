/**
 * Song Info in the touch shell: a bottom sheet with the same rows as the desktop
 * dialog, not the desktop dialog itself; a tap on title / artist / album copies it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

const mocks = vi.hoisted(() => ({
  getSong: vi.fn(),
  getSongForServer: vi.fn(),
  libraryGetFacts: vi.fn(),
  ndGetSongPath: vi.fn(),
  copyTextToClipboard: vi.fn(async () => true),
  showToast: vi.fn(),
}));

vi.mock('@/lib/api/subsonicLibrary', () => ({ getSong: mocks.getSong, getSongForServer: mocks.getSongForServer }));
vi.mock('@/lib/api/library', () => ({ libraryGetFacts: mocks.libraryGetFacts }));
vi.mock('@/lib/api/navidromeAdmin', () => ({ ndGetSongPath: mocks.ndGetSongPath }));
vi.mock('@/lib/library/libraryReady', () => ({ libraryIsReady: vi.fn(() => Promise.resolve(false)) }));
vi.mock('@/lib/server/serverMagicString', () => ({ copyTextToClipboard: mocks.copyTextToClipboard }));
vi.mock('@/lib/dom/toast', () => ({ showToast: mocks.showToast }));

import MobileSongInfoSheet from './MobileSongInfoSheet';
import { resetAuthStore, resetPlayerStore } from '@/test/helpers/storeReset';
import { usePlayerStore } from '@/features/playback/store/playerStore';

describe('MobileSongInfoSheet', () => {
  beforeEach(() => {
    resetAuthStore();
    resetPlayerStore();
    Object.values(mocks).forEach(mock => mock.mockClear());
    mocks.getSong.mockResolvedValue({
      id: 's1', title: 'Chaos', artist: 'Stormwind', album: 'Record', duration: 158, bitRate: 320, suffix: 'mp3', path: 'a/b/c.mp3',
    });
  });

  it('shows nothing until Song Info is opened', () => {
    renderWithProviders(<MobileSongInfoSheet />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens as a sheet with the song’s rows and no desktop dialog', async () => {
    usePlayerStore.getState().openSongInfo('s1');
    renderWithProviders(<MobileSongInfoSheet />);
    expect(await screen.findByText('Chaos')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Song Info' }).className).toContain('mobile-sheet');
    expect(document.querySelector('.song-info-modal')).toBeNull();
    expect(screen.getByText('320 kbps')).toBeInTheDocument();
    expect(screen.getByText('a/b/c.mp3')).toBeInTheDocument();
  });

  it('a tap on the title copies it', async () => {
    usePlayerStore.getState().openSongInfo('s1');
    renderWithProviders(<MobileSongInfoSheet />);
    fireEvent.click(await screen.findByText('Chaos'));
    await waitFor(() => expect(mocks.copyTextToClipboard).toHaveBeenCalledWith('Chaos'));
    expect(mocks.showToast).toHaveBeenCalled();
  });

  it('Close shuts the sheet', async () => {
    usePlayerStore.getState().openSongInfo('s1');
    renderWithProviders(<MobileSongInfoSheet />);
    await screen.findByText('Chaos');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(usePlayerStore.getState().songInfoModal.isOpen).toBe(false);
  });
});
