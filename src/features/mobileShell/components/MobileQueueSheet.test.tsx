import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useOrbitStore } from '@/features/orbit';
import MobileQueueSheet from './MobileQueueSheet';

const sheet = () => document.querySelector('.mobile-sheet') as HTMLElement;

describe('MobileQueueSheet', () => {
  beforeEach(() => {
    resetAllStores();
  });

  it('an Orbit guest keeps the sheet title row with its Close button', () => {
    useOrbitStore.setState({ role: 'guest', phase: 'active' });
    const onClose = vi.fn();
    renderWithProviders(<MobileQueueSheet onClose={onClose} />);
    expect(sheet()).toHaveClass('mobile-sheet--queue-guest');
    const row = sheet().querySelector('.mobile-sheet__header-row') as HTMLElement;
    expect(row.querySelector('h2')?.textContent).toBe('Queue');
    fireEvent.click(row.querySelector('button') as HTMLButtonElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('outside a guest session the queue header brings title and Close; the sheet row stays hidden', () => {
    renderWithProviders(<MobileQueueSheet onClose={vi.fn()} />);
    expect(sheet()).not.toHaveClass('mobile-sheet--queue-guest');
    expect(sheet().querySelector('.mobile-sheet__header-row h2')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Queue' }).className).toBe('queue-touch-header__title');
  });
});
