import { afterEach, describe, expect, it, vi } from 'vitest';

const { emitMock } = vi.hoisted(() => ({ emitMock: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ emit: emitMock }));

import { coverPathFromUrl, installAndroidMediaCommands } from './androidMedia';

describe('coverPathFromUrl', () => {
  it('turns a cached cover file URL into its path', () => {
    expect(coverPathFromUrl('file:///data/user/0/dev.psysonic.player/covers/a%20b/800.webp'))
      .toBe('/data/user/0/dev.psysonic.player/covers/a b/800.webp');
  });

  it('drops remote cover URLs, which carry the server login', () => {
    expect(coverPathFromUrl('https://music.example/rest/getCoverArt.view?u=x&t=y')).toBeNull();
    expect(coverPathFromUrl(null)).toBeNull();
    expect(coverPathFromUrl(undefined)).toBeNull();
  });
});

describe('installAndroidMediaCommands', () => {
  afterEach(() => emitMock.mockReset());

  it('maps native buttons onto the shared media events', () => {
    const cleanup = installAndroidMediaCommands();
    window.__psyAndroidMediaCommand?.('play', 0);
    window.__psyAndroidMediaCommand?.('pause', 0);
    window.__psyAndroidMediaCommand?.('next', 0);
    window.__psyAndroidMediaCommand?.('prev', 0);
    window.__psyAndroidMediaCommand?.('seek', 42.5);
    window.__psyAndroidMediaCommand?.('unknown', 0);
    expect(emitMock.mock.calls).toEqual([
      ['media:play'],
      ['media:pause'],
      ['media:next'],
      ['media:prev'],
      ['media:seek-absolute', 42.5],
    ]);
    cleanup();
    expect(window.__psyAndroidMediaCommand).toBeUndefined();
  });
});
