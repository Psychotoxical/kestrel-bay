import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ save: vi.fn() }));
vi.mock('@/lib/util/platform', () => ({ IS_MOBILE_SHELL: true, IS_ANDROID: true }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('@tauri-apps/api/path', () => ({
  appCacheDir: async () => '/data/user/0/dev.psysonic.player/cache',
  documentDir: async () => '/storage/emulated/0/Documents',
  join: async (...parts: string[]) => parts.join('/'),
}));

import { localCopyOfPicked, offerExportFile } from '@/lib/util/exportFile';

/**
 * The native bridge (`PsysonicFiles.kt`): answers each copy later, like its background
 * thread, with the path it wrote (an import) or the document (an export).
 */
function installBridge(error: string | null = null, writtenPath = '/data/user/0/dev.psysonic.player/cache/picked-1-a.psyfull') {
  const copyIn = vi.fn((id: number) => { setTimeout(() => window.__psyFileCopied?.(id, error, error ? null : writtenPath), 0); });
  const copyOut = vi.fn((id: number, _path: string, uri: string) => {
    setTimeout(() => window.__psyFileCopied?.(id, error, error ? null : uri), 0);
  });
  window.PsysonicAndroidFiles = { copyIn, copyOut };
  return { copyIn, copyOut };
}

describe('exports and picked files on Android', () => {
  beforeEach(() => { mocks.save.mockReset(); });
  afterEach(() => { delete window.PsysonicAndroidFiles; });

  it('streams the written export into the document the picker created', async () => {
    const bridge = installBridge();
    mocks.save.mockResolvedValue('content://com.android.providers.downloads.documents/document/42');
    await offerExportFile('/storage/emulated/0/Documents/psysonic-full-2026-10-21.psyfull');
    expect(mocks.save).toHaveBeenCalledWith({ defaultPath: 'psysonic-full-2026-10-21.psyfull' });
    expect(bridge.copyOut).toHaveBeenCalledWith(
      expect.any(Number),
      '/storage/emulated/0/Documents/psysonic-full-2026-10-21.psyfull',
      'content://com.android.providers.downloads.documents/document/42',
    );
  });

  it('copies nothing when the picker is cancelled', async () => {
    const bridge = installBridge();
    mocks.save.mockResolvedValue(null);
    await offerExportFile('/storage/emulated/0/Documents/a.psybkp');
    expect(bridge.copyOut).not.toHaveBeenCalled();
  });

  it('copies a picked document into the cache and uses the path the bridge named', async () => {
    const bridge = installBridge(null, '/data/user/0/dev.psysonic.player/cache/picked-7-psysonic-full.psyfull');
    const copy = await localCopyOfPicked('content://com.android.providers.downloads.documents/document/19');
    expect(bridge.copyIn).toHaveBeenCalledWith(
      expect.any(Number),
      'content://com.android.providers.downloads.documents/document/19',
      '/data/user/0/dev.psysonic.player/cache',
    );
    expect(copy).toBe('/data/user/0/dev.psysonic.player/cache/picked-7-psysonic-full.psyfull');
  });

  it('reports a failed copy', async () => {
    installBridge('cannot open content://x');
    await expect(localCopyOfPicked('content://x/document/a.psyfull')).rejects.toThrow('cannot open content://x');
  });

  it('leaves a plain file path alone', async () => {
    const bridge = installBridge();
    await expect(localCopyOfPicked('/storage/emulated/0/Download/a.psybkp')).resolves.toBe('/storage/emulated/0/Download/a.psybkp');
    expect(bridge.copyIn).not.toHaveBeenCalled();
  });
});
