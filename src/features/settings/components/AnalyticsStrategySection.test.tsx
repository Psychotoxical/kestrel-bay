import { beforeEach, describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { makeServer } from '@/test/helpers/factories';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import AnalyticsStrategySection from './AnalyticsStrategySection';

beforeEach(() => {
  resetAllStores();
  useAuthStore.setState({ servers: [makeServer({ name: 'Home server' })] });
});

describe('AnalyticsStrategySection (desktop)', () => {
  it('keeps the strategy table', () => {
    const { container } = renderWithProviders(<AnalyticsStrategySection />);

    expect(container.querySelector('.settings-strategy-table')).not.toBeNull();
    expect(container.querySelector('.analytics-touch')).toBeNull();
  });
});
