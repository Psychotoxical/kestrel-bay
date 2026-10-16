import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConfirmModalStore } from '@/store/confirmModalStore';
import { useOrbitStore } from '@/features/orbit/store/orbitStore';
import { orbitBulkGuard } from './orbitBulkGuard';

const request = vi.fn(async () => true);

describe('orbitBulkGuard wording (desktop)', () => {
  beforeEach(() => {
    request.mockClear();
    useConfirmModalStore.setState({ request });
  });

  it('asks a guest the shared-queue question, as it always has', async () => {
    useOrbitStore.setState({ role: 'guest', phase: 'active' });
    await orbitBulkGuard(3);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Add all of this to the Orbit queue?',
      confirmLabel: 'Add them all',
    }));
  });
});
