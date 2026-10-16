import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { useNavigate } from 'react-router';

vi.mock('@/lib/api/navidromeAdmin', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/api/navidromeAdmin')>()),
  ndLogin: vi.fn(async () => ({ isAdmin: false, token: 't' })),
}));

import Settings from './Settings';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { onInvoke } from '@/test/mocks/tauri';
import { useAuthStore } from '@/store/authStore';

function BackButton() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate(-1)}>shell back</button>;
}

async function renderSettings() {
  const view = renderWithProviders(<><Settings /><BackButton /></>, { route: '/settings' });
  await act(async () => { await Promise.resolve(); });
  return view;
}

describe('Settings (touch shell)', () => {
  beforeEach(() => {
    resetAllStores();
    onInvoke('audio_list_devices', () => []);
    onInvoke('audio_default_output_device_name', () => null);
    onInvoke('audio_canonicalize_selected_device', () => null);
    const serverId = useAuthStore.getState().addServer({
      name: 'Home', url: 'https://music.example.org', username: 'frank', password: 'p',
    });
    useAuthStore.setState({ activeServerId: serverId });
  });

  it('opens on a category list with the server on top, without the desktop tab bar or Input', async () => {
    await renderSettings();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(document.querySelector('.settings-tabs')).toBeNull();
    expect(screen.getByRole('button', { name: /Home.*frank@music\.example\.org/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Audio' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Input' })).toBeNull();
    // The search field is there right away, but does not grab focus (no keyboard on arrival).
    expect(screen.getByRole('searchbox')).not.toHaveFocus();
  });

  it('a category opens as its own page, and the shell back button returns to the list', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Audio' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Audio' })).toBeInTheDocument();
    // Sections are open headed groups, not accordions.
    expect(screen.getByRole('heading', { name: 'Normalization' }).closest('section')).not.toBeNull();
    expect(document.querySelector('details.settings-sub-section')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'shell back' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('a search hit opens its category page', async () => {
    await renderSettings();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'equalizer' } });
    const hit = screen.getAllByRole('button').find(b => b.classList.contains('settings-search-result-item'))!;
    expect(within(hit).getByText('Audio')).toBeInTheDocument();
    fireEvent.click(hit);
    expect(screen.getByRole('heading', { level: 1, name: 'Audio' })).toBeInTheDocument();
  });

  it('keeps the Advanced switch at the end of the list', async () => {
    await renderSettings();
    const advanced = screen.getByRole('checkbox', { name: 'Advanced' });
    fireEvent.click(advanced);
    expect(useAuthStore.getState().advancedSettingsEnabled).toBe(true);
  });
});
