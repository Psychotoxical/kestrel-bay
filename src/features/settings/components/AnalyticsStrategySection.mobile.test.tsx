import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { makeServer } from '@/test/helpers/factories';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { useAnalysisStrategyStore } from '@/store/analysisStrategyStore';
import AnalyticsStrategySection from './AnalyticsStrategySection';

const server = makeServer({ name: 'Home server' });

beforeEach(() => {
  resetAllStores();
  useAuthStore.setState({ servers: [server] });
});

describe('AnalyticsStrategySection (touch shell)', () => {
  it('shows one iOS-style group per server instead of the table', () => {
    const { container } = renderWithProviders(<AnalyticsStrategySection />);

    expect(container.querySelector('.settings-strategy-table')).toBeNull();
    const group = screen.getByRole('region', { name: 'Home server' });
    expect(within(group).getByRole('radiogroup', { name: 'Strategy: Home server' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Clear analysis' })).toBeInTheDocument();
  });

  it('offers parallel workers only for the aggressive strategy', () => {
    useAnalysisStrategyStore.getState().setServerStrategy(server.id, 'lazy');
    renderWithProviders(<AnalyticsStrategySection />);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Aggressive' }));
    expect(useAnalysisStrategyStore.getState().getStrategyForServer(server.id)).toBe('advanced');
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });
});
