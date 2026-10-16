import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, waitFor, within } from '@testing-library/react';
import type { InternetRadioStation } from '@/lib/api/subsonicTypes';

const hoisted = vi.hoisted(() => ({
  getSettled: vi.fn(),
  getForServer: vi.fn(),
  deleteForServer: vi.fn(),
  playRadio: vi.fn(),
  stop: vi.fn(),
  playerState: {
    currentRadio: null as InternetRadioStation | null,
    isPlaying: false,
    volume: 1,
  },
}));

vi.mock('@/lib/api/subsonicRadio', () => ({
  getInternetRadioStationsForServersSettled: hoisted.getSettled,
  getInternetRadioStationsForServer: hoisted.getForServer,
  createInternetRadioStationForServer: vi.fn(),
  updateInternetRadioStationForServer: vi.fn(),
  deleteInternetRadioStationForServer: hoisted.deleteForServer,
  uploadRadioCoverArtForServer: vi.fn(),
  deleteRadioCoverArtForServer: vi.fn(),
}));

vi.mock('@/features/playback/store/playerStore', () => {
  const usePlayerStore = Object.assign(
    (selector: (state: unknown) => unknown) => selector({
      ...hoisted.playerState,
      playRadio: hoisted.playRadio,
      stop: hoisted.stop,
    }),
    { getState: () => ({ ...hoisted.playerState, stop: hoisted.stop }) },
  );
  return { usePlayerStore };
});

vi.mock('@/features/playback/store/radioPlayer', () => ({ setRadioVolume: vi.fn() }));
vi.mock('@/features/playback/utils/playback/fadeOut', () => ({ fadeOut: vi.fn() }));
vi.mock('@/cover/radioCoverInvalidation', () => ({ invalidateRadioCoverArtCache: vi.fn() }));
vi.mock('@/lib/hooks/useNavidromeAdminRole', () => ({
  canManageNavidromeRadio: (role: string) => role !== 'user',
  useNavidromeAdminRoles: (serverIds: string[]) => Object.fromEntries(serverIds.map(id => [id, 'admin'])),
}));
vi.mock('@/features/radio/components/RadioEditModal', () => ({
  default: ({ station }: { station: InternetRadioStation | null }) => (
    <div data-testid="radio-edit">{station?.name ?? 'new'}</div>
  ),
}));
vi.mock('@/features/radio/components/RadioDirectoryModal', () => ({ default: () => null }));

import InternetRadio from './InternetRadio';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAuthStore } from '@/test/helpers/storeReset';
import { useAuthStore } from '@/store/authStore';
import { useConfirmModalStore } from '@/store/confirmModalStore';

const ALPHA: InternetRadioStation = {
  id: 'a1', serverId: 'srv-a', name: 'Alpha Radio', streamUrl: 'https://stream.alpha.test/live', homepageUrl: 'https://www.alpha.test',
};
const BETA: InternetRadioStation = { id: 'b1', serverId: 'srv-a', name: 'Beta Radio', streamUrl: 'https://beta.test/live' };

describe('InternetRadio (touch shell)', () => {
  beforeEach(() => {
    resetAuthStore();
    localStorage.clear();
    vi.clearAllMocks();
    hoisted.playerState.currentRadio = null;
    hoisted.playerState.isPlaying = false;
    useAuthStore.setState({
      isLoggedIn: true,
      servers: [{ id: 'srv-a', name: 'Home', url: 'https://a.test', username: 'a', password: 'p' }],
      activeServerId: 'srv-a',
      libraryBrowseServerIds: ['srv-a'],
    });
    hoisted.getSettled.mockResolvedValue({ stations: [ALPHA, BETA], failedServerIds: [] });
    hoisted.getForServer.mockResolvedValue([ALPHA, BETA]);
    hoisted.deleteForServer.mockResolvedValue(undefined);
    useConfirmModalStore.setState({ request: vi.fn(async () => true) });
  });

  it('lists stations as rows, and one tap plays a station', async () => {
    const view = renderWithProviders(<InternetRadio />);
    fireEvent.click(await view.findByRole('button', { name: 'Play station: Alpha Radio' }));

    expect(hoisted.playRadio).toHaveBeenCalledWith(ALPHA);
    expect(document.querySelector('.radio-card')).toBeNull();
    // The web host stands in for the missing server name.
    expect(view.getByText('alpha.test')).toBeInTheDocument();
  });

  it('a tap on the station on air stops it', async () => {
    hoisted.playerState.currentRadio = ALPHA;
    hoisted.playerState.isPlaying = true;
    const view = renderWithProviders(<InternetRadio />);

    fireEvent.click(await view.findByRole('button', { name: 'Stop station: Alpha Radio' }));
    expect(hoisted.stop).toHaveBeenCalled();
    expect(hoisted.playRadio).not.toHaveBeenCalled();
    expect(view.getByText('LIVE')).toBeInTheDocument();
  });

  it('the heart marks a favorite, and the Favorites tab shows only favorites', async () => {
    const view = renderWithProviders(<InternetRadio />);
    await view.findByRole('button', { name: 'Play station: Beta Radio' });

    const hearts = view.getAllByRole('button', { name: 'Add to favorites' });
    fireEvent.click(hearts[1]!);
    expect(view.getByRole('button', { name: 'Remove from favorites' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(view.getByRole('tab', { name: 'Favorites' }));
    expect(view.queryByRole('button', { name: 'Play station: Alpha Radio' })).toBeNull();
    expect(view.getByRole('button', { name: 'Play station: Beta Radio' })).toBeInTheDocument();
  });

  it('a long press opens the station sheet; delete asks first, then removes the station', async () => {
    const view = renderWithProviders(<InternetRadio />);
    const play = await view.findByRole('button', { name: 'Play station: Alpha Radio' });

    fireEvent.contextMenu(play);
    const sheet = view.getByRole('dialog', { name: 'Alpha Radio' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Delete station' }));

    await waitFor(() => expect(hoisted.deleteForServer).toHaveBeenCalledWith('srv-a', 'a1'));
    expect(useConfirmModalStore.getState().request).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    await waitFor(() => expect(view.queryByRole('dialog')).toBeNull());
    expect(view.queryByRole('button', { name: 'Play station: Alpha Radio' })).toBeNull();
  });

  it('hold-and-drag reordering is on only for the manual order', async () => {
    const view = renderWithProviders(<InternetRadio />);
    await view.findByRole('button', { name: 'Play station: Alpha Radio' });
    const list = document.querySelector('.mobile-radio-list')!;
    expect(list).toHaveAttribute('data-no-touch-menu');
    expect(list.querySelector('[data-radio-idx="1"]')).toHaveTextContent('Beta Radio');

    fireEvent.click(view.getAllByRole('button', { name: 'More options' })[0]!);
    expect(view.getByRole('menuitemradio', { name: 'Manual' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(view.getByRole('menuitemradio', { name: 'A → Z' }));
    // Sorted lists keep the plain long press (station sheet), no dragging.
    expect(document.querySelector('.mobile-radio-list')).not.toHaveAttribute('data-no-touch-menu');
  });

  it('"…" leads to the station editor', async () => {
    const view = renderWithProviders(<InternetRadio />);
    await view.findByRole('button', { name: 'Play station: Alpha Radio' });

    fireEvent.click(view.getAllByRole('button', { name: 'More options' })[1]!);
    fireEvent.click(within(view.getByRole('dialog', { name: 'Alpha Radio' })).getByRole('button', { name: 'Edit' }));
    expect(view.getByTestId('radio-edit')).toHaveTextContent('Alpha Radio');
    expect(view.queryByRole('dialog', { name: 'Alpha Radio' })).toBeNull();
  });
});
