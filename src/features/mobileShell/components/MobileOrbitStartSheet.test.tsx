import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { makeServer } from '@/test/helpers/factories';
import { useAuthStore } from '@/store/authStore';
import MobileOrbitStartSheet from './MobileOrbitStartSheet';

const mocks = vi.hoisted(() => ({ startOrbitSession: vi.fn(), writeText: vi.fn(async () => {}) }));

vi.mock('@/features/orbit/utils/orbit', async importOriginal => ({
  ...await importOriginal<typeof import('@/features/orbit/utils/orbit')>(),
  buildOrbitShareLink: (serverBase: string, sid: string) => `psysonic2-orbit:${serverBase}:${sid}`,
  generateSessionId: () => 'session-id',
  startOrbitSession: mocks.startOrbitSession,
}));
vi.mock('@/features/orbit/utils/orbitNames', () => ({ randomOrbitSessionName: () => 'Test Orbit' }));

describe('MobileOrbitStartSheet', () => {
  beforeEach(() => {
    resetAuthStore();
    mocks.startOrbitSession.mockReset().mockResolvedValue({});
    mocks.writeText.mockClear();
    Object.assign(navigator, { clipboard: { writeText: mocks.writeText } });
    const server = makeServer({ id: 'srv-a', name: 'Home', url: 'http://192.168.1.5:4533' });
    useAuthStore.setState({ servers: [server], activeServerId: server.id, libraryBrowseServerIds: [server.id] });
  });

  it('opens without focusing the name, warns about a home-network address and has no Ctrl+V link field', () => {
    renderWithProviders(<MobileOrbitStartSheet onClose={() => {}} />);
    expect(document.activeElement).not.toBe(screen.getByRole('textbox'));
    expect(screen.getByRole('alert')).toHaveTextContent(/home-network/i);
    expect(document.body.textContent).not.toMatch(/Ctrl\+V/);
    expect(document.querySelector('code')).toBeNull();
  });

  it('starts the session with the chosen settings and closes; the invite is shared from the room, not copied', async () => {
    const onClose = vi.fn();
    renderWithProviders(<MobileOrbitStartSheet onClose={onClose} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Friday room' } });
    fireEvent.change(screen.getByRole('slider'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Start Orbit' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(mocks.startOrbitSession).toHaveBeenCalledWith({
      name: 'Friday room', maxUsers: 4, sid: 'session-id', serverId: 'srv-a', clearQueue: true,
    });
    expect(mocks.writeText).not.toHaveBeenCalled();
  });
});
