/**
 * Siri only hands "play X" to the app when the Info.plist lists the intent and a media
 * category; without the category it answers from Apple Music (seen on a device).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vitest runs from the repository root.
const plist = readFileSync(join(process.cwd(), 'src-tauri', 'Info.ios.plist'), 'utf8');

/** The `<string>` entries of the array under `key`. */
function arrayStrings(key: string): string[] {
  const match = plist.match(new RegExp(`<key>${key}</key>\\s*<array>([\\s\\S]*?)</array>`));
  return match ? [...match[1].matchAll(/<string>([^<]+)<\/string>/g)].map(m => m[1]) : [];
}

describe('Info.ios.plist Siri declarations', () => {
  it('lists the play intent the app handles', () => {
    expect(arrayStrings('INIntentsSupported')).toContain('INPlayMediaIntent');
  });

  it('declares the music media category so Siri routes play requests to the app', () => {
    expect(arrayStrings('INSupportedMediaCategories')).toContain('INMediaCategoryMusic');
  });

  it('gives Siri a "sounds like" hint for the app name (it heard "Psychic")', () => {
    const block = plist.match(/<key>INAlternativeAppNames<\/key>\s*<array>([\s\S]*?)<\/array>\s*(?=<!--|<key>)/)?.[1] ?? '';
    expect(block).toContain('<key>INAlternativeAppName</key>');
    expect(block).toContain('<key>INAlternativeAppNamePronunciationHint</key>');
    // Apple allows at most three entries.
    expect((block.match(/<dict>/g) ?? []).length).toBeLessThanOrEqual(3);
  });
});
