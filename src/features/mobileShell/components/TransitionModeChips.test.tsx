import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { useOrbitStore } from '@/features/orbit';
import TransitionModeChips from './TransitionModeChips';

function setFlags(gaplessEnabled: boolean, crossfadeEnabled: boolean, crossfadeTrimSilence: boolean) {
  useAuthStore.setState({ gaplessEnabled, crossfadeEnabled, crossfadeTrimSilence, crossfadeSecs: 6 });
}

describe('TransitionModeChips', () => {
  beforeEach(() => {
    setFlags(false, false, false);
    useOrbitStore.setState({ role: null, phase: 'idle' });
  });

  it('marks only the active mode as pressed', () => {
    setFlags(false, true, true);
    renderWithProviders(<TransitionModeChips />);
    expect(screen.getByRole('button', { name: /AutoDJ/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Gapless/i }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: /Crossfade/i }).getAttribute('aria-pressed')).toBe('false');
  });

  it('switching modes leaves exactly one active', () => {
    setFlags(true, false, false);
    renderWithProviders(<TransitionModeChips />);
    fireEvent.click(screen.getByRole('button', { name: /Crossfade/i }));
    const s = useAuthStore.getState();
    expect([s.gaplessEnabled, s.crossfadeEnabled, s.crossfadeTrimSilence]).toEqual([false, true, false]);
  });

  it('tapping the active mode turns transitions off', () => {
    setFlags(true, false, false);
    renderWithProviders(<TransitionModeChips />);
    fireEvent.click(screen.getByRole('button', { name: /Gapless/i }));
    const s = useAuthStore.getState();
    expect([s.gaplessEnabled, s.crossfadeEnabled, s.crossfadeTrimSilence]).toEqual([false, false, false]);
  });

  it('shows the crossfade length', () => {
    renderWithProviders(<TransitionModeChips />);
    expect(screen.getByRole('button', { name: /Crossfade 6 s/i })).toBeTruthy();
  });

  it('locks the chips for an Orbit guest in a live session', () => {
    useOrbitStore.setState({ role: 'guest', phase: 'active' });
    renderWithProviders(<TransitionModeChips />);
    for (const button of screen.getAllByRole('button')) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  describe('segmented layout (queue header)', () => {
    it('is one compact row without the swipeable chip strip', () => {
      const { container } = renderWithProviders(<TransitionModeChips layout="segmented" />);
      expect(container.querySelector('.mobile-transition-bar')).not.toBeNull();
      expect(container.querySelector('.mobile-chips')).toBeNull();
      expect(container.querySelectorAll('.mobile-transition-bar__modes .mobile-segmented__item')).toHaveLength(3);
    });

    it('switches modes exclusively and turns the active one off on a second tap', () => {
      setFlags(true, false, false);
      renderWithProviders(<TransitionModeChips layout="segmented" />);
      expect(screen.getByRole('button', { name: /Gapless/i }).getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(screen.getByRole('button', { name: /AutoDJ/i }));
      let s = useAuthStore.getState();
      expect([s.gaplessEnabled, s.crossfadeEnabled, s.crossfadeTrimSilence]).toEqual([false, true, true]);
      fireEvent.click(screen.getByRole('button', { name: /AutoDJ/i }));
      s = useAuthStore.getState();
      expect([s.gaplessEnabled, s.crossfadeEnabled, s.crossfadeTrimSilence]).toEqual([false, false, false]);
    });

    it('shows the crossfade length and renders further controls beside the switch', () => {
      renderWithProviders(
        <TransitionModeChips layout="segmented"><button type="button">Extra</button></TransitionModeChips>,
      );
      expect(screen.getByRole('button', { name: /Crossfade 6 s/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Extra' }).parentElement?.className).toBe('mobile-transition-bar');
    });

    it('locks the modes for an Orbit guest in a live session', () => {
      useOrbitStore.setState({ role: 'guest', phase: 'active' });
      renderWithProviders(<TransitionModeChips layout="segmented" />);
      for (const name of [/Gapless/i, /Crossfade/i, /AutoDJ/i]) {
        expect((screen.getByRole('button', { name }) as HTMLButtonElement).disabled).toBe(true);
      }
    });
  });
});
