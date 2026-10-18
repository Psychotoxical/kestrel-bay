import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import PlayerStatsHeatmap from './PlayerStatsHeatmap';

describe('PlayerStatsHeatmap (touch shell)', () => {
  it('shows only the last 15 weeks: a whole year leaves pin-sized cells on a phone', () => {
    const { container } = renderWithProviders(
      <PlayerStatsHeatmap year={new Date().getFullYear()} dayCounts={new Map()} selectedDate={null} onSelectDate={() => {}} />,
    );

    expect(container.querySelectorAll('.player-heatmap-col').length).toBe(15);
  });
});
