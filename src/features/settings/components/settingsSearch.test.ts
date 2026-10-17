import { describe, expect, it } from 'vitest';
import i18n from '@/lib/i18n';
import { SETTINGS_SEARCH_SECTIONS } from '@/generated/settingsSearchIndex';
import { searchSettings } from '@/features/settings/components/settingsSearch';

const tEn = i18n.getFixedT('en');
const tDe = i18n.getFixedT('de');

describe('settings search index', () => {
  it.each([
    'Navidrome',
    'settings.coverSourceSectionTitle',
    'settings.externalArtwork',
    'settings.fullscreenPlayerStyle',
    'settings.trackPreviewsTitle',
    'settings.inputMouseTitle',
    'settings.lyricsWordHighlightTitle',
    'settings.lyricsPronunciationTitle',
    'settings.lyricsTranslationTitle',
    'settings.themeImportTitle',
  ])('contains the %s section', heading => {
    expect(SETTINGS_SEARCH_SECTIONS.some(s => s.titleKey === heading || s.title === heading)).toBe(true);
  });

  it('records the rows inside a section', () => {
    const navidrome = SETTINGS_SEARCH_SECTIONS.find(s => s.title === 'Navidrome');
    expect(navidrome?.keys).toEqual(expect.arrayContaining([
      'settings.playQueueSyncTitle', 'shared.navidromeSharingTitle', 'shared.allowDownloadsTitle',
    ]));
  });
});

describe('searchSettings', () => {
  it('finds AudioMuse by product name', () => {
    const hits = searchSettings('AudioMuse', 'library', tEn);
    expect(hits.some(h => h.title.includes('AudioMuse'))).toBe(true);
  });

  it('finds global volume shortcuts', () => {
    const hits = searchSettings('Volume', 'library', tEn);
    expect(hits.some(h => h.key === 'global:volume-up')).toBe(true);
    expect(hits.some(h => h.key === 'global:volume-down')).toBe(true);
  });

  it('finds per-address streaming quality by bitrate keywords', () => {
    const hits = searchSettings('bitrate', 'library', tEn);
    expect(hits).toContainEqual(expect.objectContaining({ tab: 'servers', key: 'settings.streamQualityTitle' }));
  });

  it.each(['visualizer', 'spectrum', 'oscilloscope'])('finds the visualizer section by %s', query => {
    const hits = searchSettings(query, 'library', tEn);
    expect(hits).toContainEqual(expect.objectContaining({ tab: 'appearance', key: 'visualizer.settings.section' }));
  });

  it.each(['Navidrome', 'sharing', 'downloads', 'play queue sync'])('finds the Navidrome section by %s', query => {
    const hits = searchSettings(query, 'library', tEn);
    expect(hits).toContainEqual(expect.objectContaining({ tab: 'integrations', title: 'Navidrome' }));
  });

  it('names the row that matched', () => {
    const hit = searchSettings('sharing', 'library', tEn).find(h => h.title === 'Navidrome');
    expect(hit?.context).toBe('Navidrome sharing');
    expect(hit?.focusTitle).toBe('Navidrome');
  });

  it('tolerates typos', () => {
    const hits = searchSettings('navidrom shareing', 'library', tEn);
    expect(hits[0]).toEqual(expect.objectContaining({ title: 'Navidrome', context: 'Navidrome sharing' }));
  });

  it('does not stretch a word that exists to a similar one', () => {
    const hits = searchSettings('tray', 'library', tEn);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some(h => /track/i.test(h.title))).toBe(false);
  });

  it('tells in-app and global shortcuts apart', () => {
    const hits = searchSettings('volume up', 'library', tEn).filter(h => h.title === 'Volume up');
    expect(hits.map(h => h.context).sort()).toEqual(['Global Shortcuts', 'Keyboard shortcuts'].sort());
  });

  it('searches the UI language and English', () => {
    const german = searchSettings('Freigaben', 'library', tDe, { tEn });
    expect(german).toContainEqual(expect.objectContaining({ title: 'Navidrome', context: 'Navidrome-Freigaben' }));
    const english = searchSettings('sharing', 'library', tDe, { tEn });
    expect(english).toContainEqual(expect.objectContaining({ title: 'Navidrome', context: 'Navidrome-Freigaben' }));
  });

  it('hides Advanced Mode sections while it is off', () => {
    const on = searchSettings('artist page layout', 'library', tEn, { advancedEnabled: true });
    const off = searchSettings('artist page layout', 'library', tEn, { advancedEnabled: false });
    expect(on.some(h => h.key === 'settings.artistLayoutTitle')).toBe(true);
    expect(off.some(h => h.key === 'settings.artistLayoutTitle')).toBe(false);
  });

  it('hides the Users tab when it is not available', () => {
    const hits = searchSettings('user management', 'library', tEn, { usersAvailable: false });
    expect(hits.some(h => h.tab === 'users')).toBe(false);
    expect(searchSettings('user management', 'library', tEn).some(h => h.tab === 'users')).toBe(true);
  });

  it('returns nothing for nonsense queries', () => {
    expect(searchSettings('aaaaaaa', 'library', tEn)).toEqual([]);
    expect(searchSettings('qxzvbnm', 'library', tEn)).toEqual([]);
  });
});

describe('settings search keywords on the desktop', () => {
  const queueHit = (q: string) => searchSettings(q, 'library', tEn, { tEn })
    .find(h => h.key === 'settings.queueSettingsTitle');

  it('keeps the full keyword list as one field, so adjacent words count as a phrase', () => {
    // "customize shuffle" stands together only in the full desktop list
    // (`touchKeywords` drops "customize"); the reversed order is the same words
    // without the phrase.
    const phrase = queueHit('customize shuffle');
    const reversed = queueHit('shuffle customize');
    expect(phrase).toBeDefined();
    expect(reversed).toBeDefined();
    expect(phrase!.score).toBeGreaterThan(reversed!.score);
  });
});

describe('settings search in the touch shell', () => {
  const desktop = (q: string) => searchSettings(q, 'library', tEn, { tEn });
  const touch = (q: string) => searchSettings(q, 'library', tEn, { tEn, touchShell: true });

  it('the index marks <DesktopOnly> sections and rows', () => {
    const discord = SETTINGS_SEARCH_SECTIONS.find(s => s.titleKey === 'settings.discordRichPresence');
    expect(discord?.desktopOnly).toBe(true);
    const visual = SETTINGS_SEARCH_SECTIONS.find(s => s.titleKey === 'settings.visualOptionsTitle');
    expect(visual?.desktopOnly).toBeFalsy();
    expect(visual?.desktopOnlyKeys).toEqual(expect.arrayContaining(['settings.preloadMiniPlayer', 'settings.floatingPlayerBar']));
    expect(visual?.desktopOnlyKeys).not.toContain('settings.showBitrate');
  });

  it('leaves out sections the touch shell does not render', () => {
    expect(desktop('discord').some(h => h.key === 'settings.discordRichPresence')).toBe(true);
    expect(touch('discord').some(h => h.key === 'settings.discordRichPresence')).toBe(false);
    expect(touch('equalizer').some(h => h.key === 'settings.eqTitle')).toBe(true);
  });

  it('does not lead to a kept section through its hidden rows or their keywords', () => {
    expect(desktop('tray').some(h => h.key === 'settings.behavior')).toBe(true);
    expect(touch('tray').some(h => h.key === 'settings.behavior')).toBe(false);
    expect(touch('preload mini player').some(h => h.key === 'settings.visualOptionsTitle')).toBe(false);
    expect(touch('bitrate').some(h => h.key === 'settings.visualOptionsTitle')).toBe(true);
  });

  it('offers no keyboard shortcuts or other Input tab results', () => {
    expect(desktop('volume up').some(h => h.tab === 'input')).toBe(true);
    expect(touch('volume up').some(h => h.tab === 'input')).toBe(false);
  });

  it('the index marks <TouchOnly> sections', () => {
    const downloads = SETTINGS_SEARCH_SECTIONS.find(s => s.titleKey === 'connection.downloadsStorageTitle');
    expect(downloads?.touchOnly).toBe(true);
    expect(downloads?.keys).toContain('connection.removeAllDownloads');
  });

  it('finds touch-only sections only in the touch shell', () => {
    expect(touch('remove all downloads').some(h => h.key === 'connection.downloadsStorageTitle')).toBe(true);
    expect(desktop('remove all downloads').some(h => h.key === 'connection.downloadsStorageTitle')).toBe(false);
  });
});
