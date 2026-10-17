import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import Help from './Help';

describe('Help in the touch shell', () => {
  it('has the title and the search field under it', () => {
    renderWithProviders(<Help />);
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('leaves out answers about parts the phone does not have', () => {
    renderWithProviders(<Help />);
    expect(screen.getByRole('button', { name: 'Which servers are compatible?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts and global hotkeys?' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Device Sync/ })).not.toBeInTheDocument();
  });

  it('search finds only answers the phone shows', () => {
    renderWithProviders(<Help />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hotkeys' } });
    expect(screen.queryByRole('button', { name: 'Keyboard shortcuts and global hotkeys?' })).not.toBeInTheDocument();
  });
});
