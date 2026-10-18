import { beforeEach, describe, expect, it } from 'vitest';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { trackNotificationsEnabled } from './trackNotificationScheduler';

describe('trackNotificationsEnabled (desktop)', () => {
  beforeEach(resetAuthStore);

  it('follows the setting', () => {
    expect(trackNotificationsEnabled()).toBe(false);
    useAuthStore.getState().setTrackChangeNotificationsEnabled(true);
    expect(trackNotificationsEnabled()).toBe(true);
  });
});
