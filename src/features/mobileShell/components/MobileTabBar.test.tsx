import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { makeInitialOrbitState, ORBIT_DEFAULT_SETTINGS } from '@/features/orbit/api/orbit';
import { useOrbitStore } from '@/features/orbit';
import { MOBILE_BARS_ATTR } from '@/features/mobileShell/hooks/useCollapseBarsOnScroll';
import MobileTabBar from './MobileTabBar';

function session(role: 'host' | 'guest', guestSuggestions: number) {
  const base = makeInitialOrbitState({ sid: 'sess', host: 'host', name: 'Room' });
  const queue = Array.from({ length: guestSuggestions }, (_, i) => ({ trackId: `g${i}`, addedBy: 'guest1', addedAt: i }));
  useOrbitStore.setState({ role, phase: 'active', state: { ...base, queue, settings: { ...ORBIT_DEFAULT_SETTINGS, autoApprove: false } } });
}

const orbitTab = () => screen.getByRole('button', { name: /Orbit/ });

describe('MobileTabBar Orbit tab', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('shows nothing extra outside a session', () => {
    renderWithProviders(<MobileTabBar />, { route: '/' });
    expect(orbitTab().querySelector('.mobile-tabbar__live-dot, .mobile-tabbar__badge')).toBeNull();
  });

  it('marks a running session with the live dot', () => {
    session('guest', 3);
    renderWithProviders(<MobileTabBar />, { route: '/' });
    expect(orbitTab().querySelector('.mobile-tabbar__live-dot')).not.toBeNull();
    expect(orbitTab().querySelector('.mobile-tabbar__badge')).toBeNull();
    expect(orbitTab()).toHaveTextContent('Live');
  });

  it('shows the host how many suggestions wait for approval, and tells VoiceOver', () => {
    session('host', 3);
    renderWithProviders(<MobileTabBar />, { route: '/' });
    expect(orbitTab().querySelector('.mobile-tabbar__badge')?.textContent).toBe('3');
    expect(orbitTab().querySelector('.mobile-tabbar__live-dot')).toBeNull();
    expect(orbitTab()).toHaveTextContent('3 Pending approvals');
  });
});

describe('MobileTabBar folded', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('a tap on the folded tab button unfolds the tabs instead of switching page', () => {
    renderWithProviders(<MobileTabBar />, { route: '/library' });
    document.documentElement.setAttribute(MOBILE_BARS_ATTR, 'collapsed');
    fireEvent.click(screen.getByRole('button', { name: /Mainstage/ }));
    expect(document.documentElement.hasAttribute(MOBILE_BARS_ATTR)).toBe(false);
    expect(screen.getByRole('button', { name: /Library/ })).toHaveAttribute('aria-current', 'page');
  });
});
