import { beforeEach, describe, expect, it, vi } from 'vitest';
import { open } from '@tauri-apps/plugin-shell';
import { invokeMock, onInvoke } from '@/test/mocks/tauri';
import { openExternalUrl } from './externalLink';

beforeEach(() => vi.mocked(open).mockClear());

describe('openExternalUrl (touch shell)', () => {
  it('hands the link to the native open: the plugin JS open cannot start its helper on iOS', async () => {
    onInvoke('open_external_url', () => null);

    await openExternalUrl('https://www.last.fm/api/auth');

    expect(open).not.toHaveBeenCalled();
    expect(invokeMock).toHaveBeenCalledWith('open_external_url', { url: 'https://www.last.fm/api/auth' });
  });

  it('rejects when the native side refuses the link', async () => {
    onInvoke('open_external_url', () => {
      throw 'only http and https links can be opened';
    });

    await expect(openExternalUrl('file:///etc/hosts')).rejects.toThrow('only http and https links can be opened');
  });
});
