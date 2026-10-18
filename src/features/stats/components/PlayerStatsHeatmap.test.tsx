import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import PlayerStatsHeatmap from './PlayerStatsHeatmap';

describe('PlayerStatsHeatmap (desktop)', () => {
  it('shows the whole year', () => {
    const { container } = renderWithProviders(
      <PlayerStatsHeatmap year={new Date().getFullYear()} dayCounts={new Map()} selectedDate={null} onSelectDate={() => {}} />,
    );

    expect(container.querySelectorAll('.player-heatmap-col').length).toBeGreaterThanOrEqual(53);
  });
});
