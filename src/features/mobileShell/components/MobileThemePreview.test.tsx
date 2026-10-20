import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import MobileThemePreview from './MobileThemePreview';

function loadImage(img: HTMLImageElement, width: number, height: number) {
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: width });
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: height });
  fireEvent.load(img);
}

function setup() {
  const onClose = vi.fn();
  renderWithProviders(<MobileThemePreview src="/shot.webp" alt="Frutiger Aero" onClose={onClose} />);
  const img = screen.getByAltText('Frutiger Aero') as HTMLImageElement;
  return { onClose, img };
}

describe('MobileThemePreview', () => {
  it('turns a wide desktop shot on its side on an upright phone', () => {
    window.innerWidth = 402;
    window.innerHeight = 874;
    const { img } = setup();
    loadImage(img, 1600, 900);
    expect(img).toHaveClass('mobile-theme-preview__img--turned');
  });

  it('leaves an upright shot as it is', () => {
    window.innerWidth = 402;
    window.innerHeight = 874;
    const { img } = setup();
    loadImage(img, 900, 1600);
    expect(img).not.toHaveClass('mobile-theme-preview__img--turned');
  });

  it('a tap anywhere or the close button closes it', () => {
    const { onClose, img } = setup();
    fireEvent.click(img);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
