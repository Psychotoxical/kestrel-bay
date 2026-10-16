import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, LibraryBig, MicVocal, Server } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import type { Tab } from '@/features/settings/components/settingsTabs';

interface Props {
  /** The tabs this user may open (hidden touch tabs and, for non-admins, Users already removed). */
  tabs: { id: Tab; label: string; icon: ReactNode }[];
  onOpen: (tab: Tab) => void;
}

/** Category groups of the touch settings home, top to bottom (iOS Settings style). */
const GROUPS: Tab[][] = [
  ['audio', 'lyrics'],
  ['library', 'storage'],
  ['themes', 'appearance', 'personalisation'],
  ['integrations'],
  ['users'],
  ['system'],
];

/** The desktop tab bar gives Library and Lyrics the same note; the home tiles tell them apart. */
const TILE_ICONS: Partial<Record<Tab, ReactNode>> = {
  library: <LibraryBig />,
  lyrics: <MicVocal />,
};

function hostOf(url: string): string {
  try {
    return new URL(url.startsWith('http') ? url : `http://${url}`).host;
  } catch {
    return url;
  }
}

/**
 * Touch settings home: the active server on top, then one row per settings
 * category in small groups, each opening that category as its own page, and the
 * Advanced Mode switch at the end.
 */
export default function SettingsTouchHome({ tabs, onOpen }: Props) {
  const { t } = useTranslation();
  const server = useAuthStore(s => s.servers.find(sv => sv.id === s.activeServerId) ?? null);
  const advanced = useAuthStore(s => s.advancedSettingsEnabled);
  const setAdvanced = useAuthStore(s => s.setAdvancedSettingsEnabled);
  const byId = new Map(tabs.map(tab => [tab.id, tab]));

  return (
    <div className="settings-touch-home">
      <button type="button" className="settings-touch-server" onClick={() => onOpen('servers')}>
        <span className="settings-touch-server__icon" aria-hidden="true"><Server size={24} /></span>
        <span className="settings-touch-server__text">
          <span className="settings-touch-server__name">{server?.name || t('settings.tabServers')}</span>
          {server && <span className="settings-touch-server__sub">{server.username}@{hostOf(server.url)}</span>}
        </span>
        <ChevronRight size={18} className="settings-touch-row__chevron" aria-hidden="true" />
      </button>

      {GROUPS.map(group => {
        const rows = group.map(id => byId.get(id)).filter(tab => tab !== undefined);
        if (rows.length === 0) return null;
        return (
          <div className="settings-touch-group" key={group.join('|')}>
            {rows.map(tab => (
              <button key={tab.id} type="button" className="settings-touch-row" onClick={() => onOpen(tab.id)}>
                <span className="settings-touch-row__icon" aria-hidden="true">{TILE_ICONS[tab.id] ?? tab.icon}</span>
                <span className="settings-touch-row__label">{tab.label}</span>
                <ChevronRight size={18} className="settings-touch-row__chevron" aria-hidden="true" />
              </button>
            ))}
          </div>
        );
      })}

      <div className="settings-touch-group">
        <label className="settings-touch-row settings-touch-row--toggle">
          <span className="settings-touch-row__label">{t('settings.advancedMode')}</span>
          <span className="toggle-switch">
            <input
              type="checkbox"
              checked={advanced}
              onChange={e => setAdvanced(e.target.checked)}
            />
            <span className="toggle-track" />
          </span>
        </label>
      </div>
      <p className="settings-touch-footnote">{t('settings.advancedModeTooltip')}</p>
    </div>
  );
}
