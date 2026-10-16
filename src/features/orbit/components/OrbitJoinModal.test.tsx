import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { OrbitJoinError } from '@/features/orbit/utils/guest';
import OrbitJoinModal from './OrbitJoinModal';

vi.mock('@/features/orbit/utils/orbit', async importOriginal => ({
  ...await importOriginal<typeof import('@/features/orbit/utils/orbit')>(),
  parseOrbitShareLink: () => ({ serverBase: 'http://srv', sid: 'abc123' }),
  findSessionPlaylistId: async () => 'pl',
  readOrbitState: async () => ({ ended: false }),
  joinOrbitSession: async () => { throw new OrbitJoinError('full', 'Session abc123 is full (10/10)'); },
}));
vi.mock('@/lib/server/serverEndpoint', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/server/serverEndpoint')>(),
  profileServesShareBase: () => true,
  normalizeServerBaseUrl: (url: string) => url,
}));

describe('OrbitJoinModal join failure (desktop)', () => {
  it('keeps showing the error message as it always has (translation tracked separately)', async () => {
    useAuthStore.setState({ activeServerId: 'srv', servers: [{ id: 'srv', name: 'Home', url: 'http://srv', username: 'guest', password: '' }] as never });
    renderWithProviders(<OrbitJoinModal onClose={() => {}} />, { language: 'de' });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'invite' } });
    fireEvent.click(screen.getAllByRole('button').find(b => /beitreten/i.test(b.textContent ?? '')) as HTMLButtonElement);
    await waitFor(() => expect(document.querySelector('.orbit-start-modal__error')).not.toBeNull());
    expect(document.querySelector('.orbit-start-modal__error')?.textContent).toBe('Session abc123 is full (10/10)');
  });
});
