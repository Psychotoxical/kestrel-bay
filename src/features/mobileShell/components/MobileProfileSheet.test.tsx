import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import MobileProfileSheet from './MobileProfileSheet';

describe('MobileProfileSheet', () => {
  it('lists Settings first, above Statistics', () => {
    renderWithProviders(
      <MobileProfileSheet serverName="Home" connStatus="connected" isLan={false} onClose={vi.fn()} />,
    );
    const labels = screen.getAllByRole('button').map(button => button.textContent?.trim());
    const settings = labels.indexOf('Settings');
    const statistics = labels.indexOf('Statistics');
    expect(settings).toBeGreaterThanOrEqual(0);
    expect(settings).toBeLessThan(statistics);
  });
});
