import { describe, expect, it } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { makeServer } from '@/test/helpers/factories';
import { useOrbitAccountPickerStore } from '@/features/orbit';
import MobileOrbitAccountSheet from './MobileOrbitAccountSheet';

const accounts = [
  makeServer({ id: 'a', name: 'Home', url: 'https://music.example', username: 'frank' }),
  makeServer({ id: 'b', name: 'Home (Family)', url: 'https://music.example', username: 'family' }),
];

describe('MobileOrbitAccountSheet', () => {
  it('a tap on an account picks it', async () => {
    renderWithProviders(<MobileOrbitAccountSheet />);
    let picked: Promise<unknown> = Promise.resolve();
    act(() => { picked = useOrbitAccountPickerStore.getState().request(accounts); });
    fireEvent.click(screen.getByRole('button', { name: /family/ }));
    await expect(picked).resolves.toMatchObject({ id: 'b' });
    expect(document.querySelector('.mobile-sheet')).toBeNull();
  });

  it('Close cancels the join', async () => {
    renderWithProviders(<MobileOrbitAccountSheet />);
    let picked: Promise<unknown> = Promise.resolve();
    act(() => { picked = useOrbitAccountPickerStore.getState().request(accounts); });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await expect(picked).resolves.toBeNull();
  });
});
