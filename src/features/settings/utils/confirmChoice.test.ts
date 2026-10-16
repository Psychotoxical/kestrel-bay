import { describe, expect, it, vi } from 'vitest';
import { useConfirmModalStore } from '@/store/confirmModalStore';
import { confirmChoice } from './confirmChoice';

describe('confirmChoice (desktop)', () => {
  it('keeps the browser dialog with the message', async () => {
    const request = vi.fn(async () => true);
    useConfirmModalStore.setState({ request });
    const nativeConfirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await expect(confirmChoice({ title: 'Delete', message: 'Delete it?', confirmLabel: 'Delete', cancelLabel: 'Cancel' }))
      .resolves.toBe(false);
    expect(nativeConfirm).toHaveBeenCalledWith('Delete it?');
    expect(request).not.toHaveBeenCalled();
  });
});
