import { beforeEach, describe, expect, it, vi } from 'vitest';
import { open } from '@tauri-apps/plugin-shell';
import { invokeMock } from '@/test/mocks/tauri';
import { openExternalUrl } from './externalLink';

beforeEach(() => vi.mocked(open).mockClear());

describe('openExternalUrl (desktop)', () => {
  it('keeps the shell plugin open', async () => {
    await openExternalUrl('https://www.last.fm/api/auth');

    expect(open).toHaveBeenCalledWith('https://www.last.fm/api/auth');
    expect(invokeMock.mock.calls.some(([cmd]) => cmd === 'open_external_url')).toBe(false);
  });
});
