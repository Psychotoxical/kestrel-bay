import { beforeEach, describe, expect, it } from 'vitest';
import { useFontStore } from '@/store/fontStore';

beforeEach(() => {
  localStorage.clear();
  useFontStore.setState(useFontStore.getInitialState());
});

describe('fontStore (desktop)', () => {
  it('starts on Lexend', () => {
    expect(useFontStore.getInitialState().font).toBe('lexend');
  });

  it('keeps a stored font', async () => {
    localStorage.setItem('psysonic_font', JSON.stringify({ state: { font: 'inter', uiScale: 1 }, version: 0 }));
    await useFontStore.persist.rehydrate();
    expect(useFontStore.getState().font).toBe('inter');
  });

  it('falls back to Lexend for the touch-only system font a phone backup brought along', async () => {
    localStorage.setItem('psysonic_font', JSON.stringify({ state: { font: 'system', uiScale: 1 }, version: 0 }));
    await useFontStore.persist.rehydrate();
    expect(useFontStore.getState().font).toBe('lexend');
  });
});
