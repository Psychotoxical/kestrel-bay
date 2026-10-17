import { beforeEach, describe, expect, it } from 'vitest';
import { useMobileTabStore } from './mobileTabStore';

const record = (key: string, pathname: string) => useMobileTabStore.getState().record(key, pathname);
const tabOf = (key: string) => useMobileTabStore.getState().byEntry[key]?.tab;

describe('mobile tab of each page', () => {
  beforeEach(() => {
    useMobileTabStore.setState({ byEntry: {}, current: null });
  });

  it('an album opened from the Mainstage stays in the Mainstage tab', () => {
    record('home', '/');
    record('album', '/album/a1');
    record('releases', '/new-releases');
    expect(tabOf('album')).toBe('mainstage');
    expect(tabOf('releases')).toBe('mainstage');
  });

  it('only a tab root starts its own tab', () => {
    record('home', '/');
    record('library', '/library');
    record('albums', '/albums');
    record('album', '/album/a1');
    expect(tabOf('albums')).toBe('library');
    expect(tabOf('album')).toBe('library');
  });

  it('going back gives an entry the tab it had', () => {
    record('home', '/');
    record('album', '/album/a1');
    record('playlists', '/playlists');
    record('album', '/album/a1');
    expect(useMobileTabStore.getState().current).toBe('mainstage');
  });

  it('without history a page starts in the tab its route belongs to', () => {
    record('deep', '/album/a1');
    expect(tabOf('deep')).toBe('library');
  });

  it('a key reused on another path counts as a new entry', () => {
    record('default', '/');
    record('lib', '/library');
    record('default', '/orbit');
    expect(useMobileTabStore.getState().current).toBe('orbit');
  });

  it('pages outside the tabs leave the tab as it was', () => {
    record('home', '/');
    record('settings', '/settings');
    expect(tabOf('settings')).toBeUndefined();
    record('album', '/album/a1');
    expect(tabOf('album')).toBe('mainstage');
  });
});
