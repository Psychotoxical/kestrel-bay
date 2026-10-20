import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ android: false, allowIosLandscape: vi.fn() }));

vi.mock('@/lib/util/platform', () => ({
  get IS_ANDROID() { return mocks.android; },
}));
vi.mock('@/features/mobileShell/ios/iosOrientation', () => ({ allowLandscape: mocks.allowIosLandscape }));

import { allowLandscape } from './landscape';

describe('allowLandscape', () => {
  afterEach(() => {
    mocks.android = false;
    mocks.allowIosLandscape.mockReset();
    delete window.PsysonicAndroidShell;
  });

  it('asks the Android activity on Android, not iOS', () => {
    mocks.android = true;
    const host = { setDarkBackground: vi.fn(), allowLandscape: vi.fn() };
    window.PsysonicAndroidShell = host;
    allowLandscape(true);
    allowLandscape(false);
    expect(host.allowLandscape.mock.calls).toEqual([[true], [false]]);
    expect(mocks.allowIosLandscape).not.toHaveBeenCalled();
  });

  it('does nothing on Android without the shell bridge', () => {
    mocks.android = true;
    expect(() => allowLandscape(true)).not.toThrow();
    expect(mocks.allowIosLandscape).not.toHaveBeenCalled();
  });

  it('goes the iOS way on iOS', () => {
    allowLandscape(true);
    expect(mocks.allowIosLandscape).toHaveBeenCalledWith(true);
  });
});
