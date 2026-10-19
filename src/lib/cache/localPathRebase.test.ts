import { describe, expect, it, vi } from 'vitest';
import { localPathRebaseReady, rebasedLocalPath, setLocalPathRebase } from './localPathRebase';

const NEW_ROOT = '/var/mobile/Containers/Data/Application/NEW-UUID/Library/Application Support/dev.psysonic.player/media';
const OLD = '/private/var/mobile/Containers/Data/Application/OLD-UUID/Library/Application Support/dev.psysonic.player/media/cache/srv/Band/Album/01 - Song.mp3';

describe('rebasedLocalPath', () => {
  it('moves a path from the previous app container onto the current one', () => {
    expect(rebasedLocalPath(OLD, NEW_ROOT)).toBe(`${NEW_ROOT}/cache/srv/Band/Album/01 - Song.mp3`);
  });

  it('leaves a path that already lives under the current root alone', () => {
    expect(rebasedLocalPath(`${NEW_ROOT}/cache/a.mp3`, NEW_ROOT)).toBeNull();
  });

  it('leaves paths outside an app container media folder alone', () => {
    expect(rebasedLocalPath('/Volumes/Music/cache/a.mp3', NEW_ROOT)).toBeNull();
    expect(rebasedLocalPath(OLD, '/home/frank/.local/share/dev.psysonic.player/media')).toBeNull();
  });
});

describe('localPathRebaseReady', () => {
  it('waits for the registered rebase, and a failed one does not block', async () => {
    let finish!: () => void;
    setLocalPathRebase(new Promise<void>(resolve => { finish = resolve; }));
    const after = vi.fn();
    const waiting = localPathRebaseReady().then(after);
    await Promise.resolve();
    expect(after).not.toHaveBeenCalled();
    finish();
    await waiting;
    expect(after).toHaveBeenCalled();

    setLocalPathRebase(Promise.reject(new Error('no path api')));
    await expect(localPathRebaseReady()).resolves.toBeUndefined();
  });
});
