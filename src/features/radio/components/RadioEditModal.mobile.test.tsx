import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import RadioEditModal from '@/features/radio/components/RadioEditModal';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

const STATION = { id: 'a1', serverId: 'srv-a', name: 'Alpha Radio', streamUrl: 'https://alpha.test/live' };

describe('RadioEditModal (touch shell)', () => {
  it('opens as a sheet with URL keyboards and no keyboard on open, and saves', () => {
    const onSave = vi.fn(async () => {});
    renderWithProviders(
      <RadioEditModal
        station={STATION}
        initialServerId="srv-a"
        serverOptions={[{ id: 'srv-a', label: 'Server A' }]}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Edit' })).toHaveClass('mobile-sheet');
    expect(document.querySelector('.modal-overlay')).toBeNull();
    const name = screen.getByRole('textbox', { name: 'Station name…' });
    expect(name).not.toHaveFocus();
    expect(screen.getByRole('textbox', { name: 'Stream URL…' })).toHaveAttribute('type', 'url');

    fireEvent.change(name, { target: { value: 'Alpha Live' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      serverId: 'srv-a',
      name: 'Alpha Live',
      streamUrl: 'https://alpha.test/live',
      homepageUrl: '',
      coverFile: null,
      coverRemoved: false,
    });
  });
});
