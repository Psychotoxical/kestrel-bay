import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfirmModalStore } from '@/store/confirmModalStore';
import { useOrbitStore } from '@/features/orbit/store/orbitStore';
import { orbitBulkGuard } from './orbitBulkGuard';

const request = vi.fn(async () => true);

describe('orbitBulkGuard wording (touch shell)', () => {
  beforeEach(() => {
    request.mockClear();
    useConfirmModalStore.setState({ request });
  });

  it('asks a guest whether to suggest the tracks to the host', async () => {
    useOrbitStore.setState({ role: 'guest', phase: 'active' });
    await orbitBulkGuard(3);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Suggest all of this to the host?',
      message: 'This sends 3 tracks to the host as suggestions in one go. Go ahead?',
      confirmLabel: 'Suggest them all',
    }));
  });

  it('keeps the shared-queue question for the host and for a guest still joining', async () => {
    for (const [role, phase] of [['host', 'active'], ['guest', 'joining']] as const) {
      useOrbitStore.setState({ role, phase });
      await orbitBulkGuard(3);
      expect(request).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Add all of this to the Orbit queue?' }));
    }
  });
});
