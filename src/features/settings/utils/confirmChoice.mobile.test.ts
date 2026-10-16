import { describe, expect, it, vi } from 'vitest';
import { useConfirmModalStore } from '@/store/confirmModalStore';
import { confirmChoice } from './confirmChoice';

const CHOICE = { title: 'Delete', message: 'Delete server "Home"?', confirmLabel: 'Delete', cancelLabel: 'Cancel', danger: true };

describe('confirmChoice (touch shell)', () => {
  it('asks through the app dialog, not the web view confirm()', async () => {
    const request = vi.fn(async () => true);
    useConfirmModalStore.setState({ request });
    const nativeConfirm = vi.spyOn(window, 'confirm');

    await expect(confirmChoice(CHOICE)).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith(CHOICE);
    expect(nativeConfirm).not.toHaveBeenCalled();
  });
});
