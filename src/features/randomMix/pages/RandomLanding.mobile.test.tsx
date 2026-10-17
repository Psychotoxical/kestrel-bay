import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';

vi.mock('@/features/randomMix/hooks/useLuckyMixAvailable', () => ({ useLuckyMixAvailable: () => false }));

import RandomLanding from './RandomLanding';

function Location() {
  return <output data-testid="location">{useLocation().pathname}</output>;
}

describe('Build a Mix in the touch shell', () => {
  it('has a title and lists the mixes as rows with their description', () => {
    renderWithProviders(<><RandomLanding /><Location /></>, { route: '/random' });
    expect(screen.getByRole('heading', { name: 'Build a Mix' })).toBeInTheDocument();
    const byTracks = screen.getByRole('button', { name: /Mix by Tracks/ });
    expect(byTracks).toHaveTextContent('Random selection of tracks from your entire library');
    expect(screen.getByRole('button', { name: /Mix by Albums/ })).toBeInTheDocument();
    fireEvent.click(byTracks);
    expect(screen.getByTestId('location')).toHaveTextContent('/random/mix');
  });
});
