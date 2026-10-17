import { afterEach, describe, expect, it } from 'vitest';
import { useDevOfflineBrowseStore } from '@/store/devOfflineBrowseStore';

describe('offline switch on the desktop', () => {
  afterEach(() => {
    useDevOfflineBrowseStore.getState().setForceOffline(false);
  });

  it('stays a DEV simulation that is not stored', () => {
    useDevOfflineBrowseStore.getState().setForceOffline(true);
    expect(localStorage.getItem('psysonic-offline-only')).toBeNull();
  });
});
