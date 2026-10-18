import { beforeEach, describe, expect, it } from 'vitest';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { trackNotificationsEnabled } from './trackNotificationScheduler';

describe('trackNotificationsEnabled (touch shell)', () => {
  beforeEach(resetAuthStore);

  it('stays off even when a desktop settings backup switched the setting on', () => {
    useAuthStore.getState().setTrackChangeNotificationsEnabled(true);
    expect(trackNotificationsEnabled()).toBe(false);
  });
});
