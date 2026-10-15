import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { useOrbitStore } from '@/features/orbit';
import { setTransitionMode } from '@/features/playback/utils/playback/playbackTransition';
import CrossfadeLengthSlider from './CrossfadeLengthSlider';

describe('CrossfadeLengthSlider', () => {
  beforeEach(() => {
    setTransitionMode('none');
    useAuthStore.setState({ crossfadeSecs: 3 });
    useOrbitStore.setState({ role: null, phase: 'idle' });
  });

  it('is hidden unless crossfade is the active transition', () => {
    for (const mode of ['none', 'gapless', 'autodj'] as const) {
      setTransitionMode(mode);
      const { container, unmount } = renderWithProviders(<CrossfadeLengthSlider />);
      expect(container.querySelector('input[type="range"]')).toBeNull();
      unmount();
    }
  });

  it('shows and changes the crossfade length', () => {
    setTransitionMode('crossfade');
    renderWithProviders(<CrossfadeLengthSlider />);
    const slider = screen.getByRole('slider', { name: /Crossfade/ });
    expect(screen.getByText('3.0 s')).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '6.5' } });
    expect(useAuthStore.getState().crossfadeSecs).toBe(6.5);
    expect(screen.getByText('6.5 s')).toBeInTheDocument();
  });

  it('is locked for an Orbit guest in a live session', () => {
    setTransitionMode('crossfade');
    useOrbitStore.setState({ role: 'guest', phase: 'active' });
    renderWithProviders(<CrossfadeLengthSlider />);
    expect(screen.getByRole('slider')).toBeDisabled();
  });
});
