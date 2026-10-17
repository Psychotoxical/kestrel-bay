import { describe, expect, it } from 'vitest';
import { resolveOfflineDisconnectNavAction } from '@/features/offline/utils/offlineBrowseRouting';

describe('offline redirect in the touch shell', () => {
  const onDisconnect = (pathname: string) => resolveOfflineDisconnectNavAction(pathname, false, true, false, false, true);

  it('keeps the Mainstage and the Library tab open', () => {
    expect(onDisconnect('/').kind).toBe('stay-reload');
    expect(onDisconnect('/library').kind).toBe('stay-reload');
  });

  it('still leaves pages that show nothing offline', () => {
    expect(onDisconnect('/radio')).toEqual({ kind: 'redirect', to: '/albums' });
  });
});
