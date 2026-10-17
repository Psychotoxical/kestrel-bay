import { beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/plugin-dialog', () => ({ save }));
vi.mock('@tauri-apps/api/path', () => ({
  documentDir: async () => '/var/mobile/Containers/Data/Application/APP/Documents',
  join: async (...parts: string[]) => parts.join('/'),
}));

import { offerExportFile, pickExportPath } from '@/lib/util/exportFile';

describe('exports in the touch shell (iOS)', () => {
  beforeEach(() => { save.mockReset(); });

  it('writes into the app\'s own Documents folder first, without asking', async () => {
    await expect(pickExportPath({ defaultPath: 'psysonic-logs.log' }))
      .resolves.toBe('/var/mobile/Containers/Data/Application/APP/Documents/psysonic-logs.log');
    expect(save).not.toHaveBeenCalled();
  });

  it('then hands the written file to the Files picker by its name', async () => {
    save.mockResolvedValue('file:///private/var/mobile/Downloads/psysonic-logs.log');
    await offerExportFile('/var/mobile/Containers/Data/Application/APP/Documents/psysonic-logs.log');
    expect(save).toHaveBeenCalledWith({ defaultPath: 'psysonic-logs.log' });
  });

  it('keeps going when the picker fails or is cancelled', async () => {
    save.mockRejectedValue(new Error('cancelled'));
    await expect(offerExportFile('/x/Documents/a.log')).resolves.toBeUndefined();
  });
});
