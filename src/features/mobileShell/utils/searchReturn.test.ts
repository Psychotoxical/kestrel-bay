import { beforeEach, describe, expect, it } from 'vitest';
import { forgetSearchReturn, rememberSearchReturn, takeSearchReturn } from './searchReturn';

describe('searchReturn', () => {
  beforeEach(() => forgetSearchReturn());

  it('a back step onto the page under the search returns the query, once', () => {
    rememberSearchReturn('  metallica ', 'k1');
    expect(takeSearchReturn('k1', true)).toBe('metallica');
    expect(takeSearchReturn('k1', true)).toBeNull();
  });

  it('ignores forward steps and other pages', () => {
    rememberSearchReturn('metallica', 'k1');
    expect(takeSearchReturn('k2', true)).toBeNull();
    expect(takeSearchReturn('k1', false)).toBeNull();
    expect(takeSearchReturn('k1', true)).toBe('metallica');
  });

  it('remembers nothing for an empty query and forgets on request', () => {
    rememberSearchReturn('   ', 'k1');
    expect(takeSearchReturn('k1', true)).toBeNull();
    rememberSearchReturn('metallica', 'k1');
    forgetSearchReturn();
    expect(takeSearchReturn('k1', true)).toBeNull();
  });
});
