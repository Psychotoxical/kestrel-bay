import { beforeEach, describe, expect, it, vi } from 'vitest';

const save = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/plugin-dialog', () => ({ save }));

import { offerExportFile, pickExportPath } from '@/lib/util/exportFile';

describe('exports on the desktop', () => {
  beforeEach(() => { save.mockReset(); });

  it('writes where the user picks, as before', async () => {
    save.mockResolvedValue('/home/frank/psysonic-logs.log');
    const options = { defaultPath: 'psysonic-logs.log', filters: [{ name: 'Log files', extensions: ['log'] }] };
    await expect(pickExportPath(options)).resolves.toBe('/home/frank/psysonic-logs.log');
    expect(save).toHaveBeenCalledWith(options);
  });

  it('writes nothing when the dialog is cancelled', async () => {
    save.mockResolvedValue(null);
    await expect(pickExportPath({ defaultPath: 'x.log' })).resolves.toBeNull();
  });

  it('has nothing to offer afterwards', async () => {
    await offerExportFile('/home/frank/psysonic-logs.log');
    expect(save).not.toHaveBeenCalled();
  });
});
