import { beforeEach, describe, expect, it } from 'vitest';
import { useFontStore } from '@/store/fontStore';

beforeEach(() => {
  localStorage.clear();
  useFontStore.setState(useFontStore.getInitialState());
});

describe('fontStore (touch shell)', () => {
  it('starts on the system font', () => {
    expect(useFontStore.getInitialState().font).toBe('system');
  });

  it('keeps the stored system font', async () => {
    localStorage.setItem('psysonic_font', JSON.stringify({ state: { font: 'system', uiScale: 1 }, version: 0 }));
    await useFontStore.persist.rehydrate();
    expect(useFontStore.getState().font).toBe('system');
  });

  it('keeps any other stored font: the choice applies as on the desktop', async () => {
    localStorage.setItem('psysonic_font', JSON.stringify({ state: { font: 'inter', uiScale: 1 }, version: 0 }));
    await useFontStore.persist.rehydrate();
    expect(useFontStore.getState().font).toBe('inter');
  });
});
