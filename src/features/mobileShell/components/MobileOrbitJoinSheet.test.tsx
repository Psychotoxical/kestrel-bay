import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { useAuthStore } from '@/store/authStore';
import { OrbitJoinError } from '@/features/orbit/utils/guest';
import MobileOrbitJoinSheet from './MobileOrbitJoinSheet';

const join = vi.hoisted(() => ({ error: null as unknown }));

vi.mock('@/features/orbit/utils/orbit', async importOriginal => ({
  ...await importOriginal<typeof import('@/features/orbit/utils/orbit')>(),
  parseOrbitShareLink: () => ({ serverBase: 'http://srv', sid: 'abc123' }),
  findSessionPlaylistId: async () => 'pl',
  readOrbitState: async () => ({ ended: false }),
  joinOrbitSession: async () => { throw join.error; },
}));
vi.mock('@/lib/server/serverEndpoint', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/server/serverEndpoint')>(),
  profileServesShareBase: () => true,
  normalizeServerBaseUrl: (url: string) => url,
}));

async function joinAndReadError(): Promise<string | null | undefined> {
  renderWithProviders(<MobileOrbitJoinSheet onClose={() => {}} />, { language: 'de' });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'invite' } });
  fireEvent.click(screen.getByRole('button', { name: 'Beitreten' }));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  return screen.getByRole('alert').textContent;
}

describe('MobileOrbitJoinSheet', () => {
  beforeEach(() => {
    useAuthStore.setState({ activeServerId: 'srv', servers: [{ id: 'srv', name: 'Home', url: 'http://srv', username: 'guest', password: '' }] as never });
  });

  it('opens without focusing the field, so the keyboard stays down', () => {
    renderWithProviders(<MobileOrbitJoinSheet onClose={() => {}} />);
    expect(document.activeElement).not.toBe(screen.getByRole('textbox'));
  });

  it('a failed join shows the translated reason, not the developer message', async () => {
    join.error = new OrbitJoinError('full', 'Session abc123 is full (10/10)');
    expect(await joinAndReadError()).toBe('Session ist voll');
  });

  it('anything else reads as the generic failure', async () => {
    join.error = new Error('NetworkError when attempting to fetch resource.');
    expect(await joinAndReadError()).toBe('Session konnte nicht beigetreten werden');
  });
});
