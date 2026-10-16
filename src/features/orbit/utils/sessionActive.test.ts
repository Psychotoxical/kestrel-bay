import { describe, expect, it } from 'vitest';
import { isOrbitGuestFollowingHost } from './sessionActive';

describe('isOrbitGuestFollowingHost', () => {
  it('is true for a guest joining or in an active session', () => {
    expect(isOrbitGuestFollowingHost('guest', 'joining')).toBe(true);
    expect(isOrbitGuestFollowingHost('guest', 'active')).toBe(true);
  });

  it('is false for the host, outside a session, and once the session is over', () => {
    expect(isOrbitGuestFollowingHost('host', 'active')).toBe(false);
    expect(isOrbitGuestFollowingHost(null, 'idle')).toBe(false);
    expect(isOrbitGuestFollowingHost('guest', 'ended')).toBe(false);
    expect(isOrbitGuestFollowingHost('guest', 'error')).toBe(false);
  });
});
