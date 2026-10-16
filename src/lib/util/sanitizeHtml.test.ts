import { describe, expect, it } from 'vitest';
import { sanitizeBioHtml } from './sanitizeHtml';

describe('sanitizeBioHtml', () => {
  it('drops the trailing "Read more on Last.fm" link', () => {
    expect(sanitizeBioHtml('A band. <a href="https://www.last.fm/music/x">Read more on Last.fm</a>.'))
      .toBe('A band.');
  });

  it('keeps links earlier in the text and everything after them', () => {
    expect(sanitizeBioHtml(
      'Formed in <a href="https://example.org/dresden">Dresden</a> in 1986. <a href="https://www.last.fm/music/x">Read more on Last.fm</a>',
    )).toBe('Formed in <a href="https://example.org/dresden">Dresden</a> in 1986.');
  });

  it('leaves a bio without a trailing link alone', () => {
    expect(sanitizeBioHtml('See <a href="https://example.org">site</a> for more.'))
      .toBe('See <a href="https://example.org">site</a> for more.');
  });
});
