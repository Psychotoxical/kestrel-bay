import { beforeEach, describe, expect, it } from 'vitest';
import { AppearanceTab } from './AppearanceTab';
import { PersonalisationTab } from './PersonalisationTab';
import { SystemTab } from './SystemTab';
import { StorageTab } from './StorageTab';
import { IntegrationsTab } from './IntegrationsTab';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { onInvoke } from '@/test/mocks/tauri';
import { useAuthStore } from '@/store/authStore';

beforeEach(() => {
  resetAllStores();
  onInvoke('is_tiling_wm', () => false);
  onInvoke('get_media_tier_size', () => 0);
  useAuthStore.setState({ advancedSettingsEnabled: true });
});

describe('settings the touch shell leaves out', () => {
  it('Appearance: no window, mini player, player bar, zoom, fullscreen or visualizer settings', () => {
    const { queryByText } = renderWithProviders(<AppearanceTab />);
    for (const gone of [
      'Preload mini player', 'Floating Player Bar', 'Full Title on Hover', 'Cover Art Background',
      'Interface Scale', 'Fullscreen player style', 'Library card grids',
    ]) {
      expect(queryByText(gone), gone).toBeNull();
    }
    // Kept: settings the touch pages use.
    expect(queryByText('Show Bitrate')).not.toBeNull();
    expect(queryByText('Seekbar Style')).not.toBeNull();
  });

  it('Personalisation: no player bar, queue toolbar, album header or compact buttons', () => {
    const { queryByText, queryAllByText } = renderWithProviders(<PersonalisationTab />);
    for (const gone of ['Player bar', 'Queue Toolbar', 'Album page layout', 'Compact buttons', 'Now Playing at top']) {
      expect(queryByText(gone), gone).toBeNull();
    }
    expect(queryAllByText('Mainstage').length).toBeGreaterThan(0);
    expect(queryByText('Smart shuffle')).not.toBeNull();
  });

  it('System: no tray and no "What\'s New" banner switch, the clock stays', () => {
    const { queryByText } = renderWithProviders(<SystemTab />);
    expect(queryByText('Show Tray Icon')).toBeNull();
    expect(queryByText('Start Minimized to Tray')).toBeNull();
    expect(queryByText("Show 'What's New' on update")).toBeNull();
    expect(queryByText('Clock Format')).not.toBeNull();
  });

  it('Offline & Cache: no folder pickers', () => {
    const { queryByText } = renderWithProviders(<StorageTab />);
    expect(queryByText('Media folder')).toBeNull();
    expect(queryByText('ZIP Export & Archiving')).toBeNull();
    expect(queryByText('Buffering')).not.toBeNull();
  });

  it('Integrations: no Discord Rich Presence', () => {
    const { queryByText } = renderWithProviders(<IntegrationsTab />);
    expect(queryByText('Discord Rich Presence')).toBeNull();
    expect(queryByText('Bandsintown tour dates')).not.toBeNull();
  });
});
