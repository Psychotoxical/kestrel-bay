import { describe, expect, it } from 'vitest';

// The touch help sheet's own wording (MobileOrbitHelpSheet): every locale has
// it, and none of it sends a phone user to a keyboard or a mouse.
const modules = import.meta.glob<Record<string, Record<string, string>>>('./*/orbit.ts', { eager: true });
const TOUCH_KEYS = [3, 4, 5, 6, 8, 9].map(n => `helpSec${n}BodyTouch`);

describe('Orbit touch help texts', () => {
  const locales = Object.entries(modules).map(([path, mod]) => [path.split('/')[1], mod.orbit] as const);

  it('covers all locales', () => {
    expect(locales.length).toBeGreaterThanOrEqual(16);
  });

  it.each(locales)('%s has every touch text, different from the desktop one', (_lng, orbit) => {
    for (const key of TOUCH_KEYS) {
      expect(orbit[key], key).toBeTruthy();
      expect(orbit[key], key).not.toBe(orbit[key.replace(/Touch$/, '')]);
    }
  });

  it.each(locales)('%s touch texts mention no keyboard shortcuts', (_lng, orbit) => {
    for (const key of TOUCH_KEYS) {
      expect(orbit[key], key).not.toMatch(/Ctrl|Cmd|⌘/);
    }
  });

  it('the English touch texts talk about taps, not clicks', () => {
    const en = Object.fromEntries(locales).en as unknown as Record<string, string> & { diag: Record<string, string> };
    for (const key of TOUCH_KEYS) {
      expect(en[key], key).not.toMatch(/click/i);
    }
    expect(en.diag.hintTouch).not.toMatch(/click/i);
  });

  it.each(locales)('%s has the guest bulk question and the touch diagnostics hint', (_lng, orbit) => {
    const table = orbit as unknown as Record<string, string> & { diag: Record<string, string> };
    for (const key of ['bulkConfirmGuestTitle', 'bulkConfirmGuestBody', 'bulkConfirmGuestYes']) {
      expect(table[key], key).toBeTruthy();
    }
    expect(table.bulkConfirmGuestBody).toContain('{{count}}');
    expect(table.diag.hintTouch).toBeTruthy();
  });
});
