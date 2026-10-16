import { beforeEach, describe, expect, it } from 'vitest';
import { readStartMinimizedToTray, shouldDeferMainWindowRevealThisSession } from './readStartMinimizedToTray';

describe('readStartMinimizedToTray (touch shell)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('never starts hidden: there is no tray to bring the app back', () => {
    localStorage.setItem('psysonic-auth', JSON.stringify({
      state: { startMinimizedToTray: true, showTrayIcon: true },
    }));
    expect(readStartMinimizedToTray()).toBe(false);
    expect(shouldDeferMainWindowRevealThisSession()).toBe(false);
  });
});
