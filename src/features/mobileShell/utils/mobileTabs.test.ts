import { describe, expect, it } from 'vitest';
import { activeMobileTab, hasOwnMobileHeader, isMobileTabRoot } from './mobileTabs';

describe('activeMobileTab', () => {
  it('maps tab roots to their tab', () => {
    expect(activeMobileTab('/')).toBe('mainstage');
    expect(activeMobileTab('/library')).toBe('library');
    expect(activeMobileTab('/orbit')).toBe('orbit');
    expect(activeMobileTab('/playlists')).toBe('playlists');
  });

  it('keeps detail pages in the tab they were opened from', () => {
    expect(activeMobileTab('/album/abc')).toBe('library');
    expect(activeMobileTab('/artist/abc')).toBe('library');
    expect(activeMobileTab('/genres/Rock')).toBe('library');
    expect(activeMobileTab('/random/mix')).toBe('library');
    expect(activeMobileTab('/playlists/42')).toBe('playlists');
  });

  it('does not treat a route as a prefix of a longer name', () => {
    expect(activeMobileTab('/albumsx')).toBeNull();
    expect(activeMobileTab('/radioactive')).toBeNull();
  });

  it('leaves pages outside the tabs unselected', () => {
    expect(activeMobileTab('/settings')).toBeNull();
    expect(activeMobileTab('/now-playing')).toBeNull();
  });
});

describe('isMobileTabRoot', () => {
  it('is true only for the four tab roots', () => {
    expect(isMobileTabRoot('/')).toBe(true);
    expect(isMobileTabRoot('/library')).toBe(true);
    expect(isMobileTabRoot('/albums')).toBe(false);
    expect(isMobileTabRoot('/playlists/42')).toBe(false);
  });
});

describe('hasOwnMobileHeader', () => {
  it('is true for pages that draw their own top row', () => {
    expect(hasOwnMobileHeader('/albums')).toBe(true);
    expect(hasOwnMobileHeader('/artists')).toBe(true);
    expect(hasOwnMobileHeader('/album/1')).toBe(true);
    expect(hasOwnMobileHeader('/artist/1')).toBe(true);
    expect(hasOwnMobileHeader('/playlists/7')).toBe(true);
    expect(hasOwnMobileHeader('/genres/Metal')).toBe(true);
    expect(hasOwnMobileHeader('/genres')).toBe(false);
    expect(hasOwnMobileHeader('/playlists')).toBe(false);
    expect(hasOwnMobileHeader('/settings')).toBe(false);
  });
});
