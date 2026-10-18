import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { AppearanceTab } from './AppearanceTab';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useFontStore } from '@/store/fontStore';

describe('AppearanceTab (touch shell)', () => {
  beforeEach(resetAllStores);

  it('leaves out the track list cover and bitrate toggles: touch song lists always show covers and never the bitrate', () => {
    renderWithProviders(<AppearanceTab />);

    expect(screen.queryByRole('checkbox', { name: 'Album art in track lists' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Show Bitrate' })).not.toBeInTheDocument();
  });

  it('keeps the playlist cover photo toggle: the touch playlist header honours it', () => {
    renderWithProviders(<AppearanceTab />);

    expect(screen.getByRole('checkbox', { name: 'Playlist Cover Photo' })).toBeInTheDocument();
  });

  it('offers the system font first and switches to it', () => {
    useFontStore.setState({ font: 'inter' });
    renderWithProviders(<AppearanceTab />);

    const system = screen.getByRole('button', { name: 'System font' });
    const inter = screen.getByRole('button', { name: 'Inter' });
    expect(system.compareDocumentPosition(inter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(system.compareDocumentPosition(screen.getByRole('button', { name: /OpenDyslexic/ })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(system);
    expect(useFontStore.getState().font).toBe('system');
  });
});
