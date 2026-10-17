import { afterEach, describe, expect, it } from 'vitest';
import { isDevOfflineBrowseForced, useDevOfflineBrowseStore } from '@/store/devOfflineBrowseStore';

describe('"downloaded music only" in the touch shell', () => {
  afterEach(() => {
    useDevOfflineBrowseStore.getState().setForceOffline(false);
  });

  it('takes effect and keeps the choice across launches', () => {
    useDevOfflineBrowseStore.getState().setForceOffline(true);
    expect(isDevOfflineBrowseForced()).toBe(true);
    const stored = JSON.parse(localStorage.getItem('psysonic-offline-only') ?? 'null');
    expect(stored?.state?.forceOffline).toBe(true);
  });
});
