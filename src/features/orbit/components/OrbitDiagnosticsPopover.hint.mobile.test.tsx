import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { useOrbitStore } from '@/features/orbit/store/orbitStore';
import OrbitDiagnosticsPopover from './OrbitDiagnosticsPopover';

describe('OrbitDiagnosticsPopover hint (touch shell)', () => {
  it('tells the user to tap Copy', () => {
    useOrbitStore.setState({ role: 'host', phase: 'active' });
    const { container } = renderWithProviders(<OrbitDiagnosticsPopover onClose={() => {}} />);
    expect(container.querySelector('.orbit-diag-pop__hint')?.textContent).toMatch(/tap Copy/);
  });
});
