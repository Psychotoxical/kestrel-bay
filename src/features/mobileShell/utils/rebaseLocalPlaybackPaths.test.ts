import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(async () => '/var/mobile/Containers/Data/Application/NEW/Library/Application Support/dev.psysonic.player'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}));

import { useLocalPlaybackStore, type LocalPlaybackEntry } from '@/store/localPlaybackStore';
import { useAuthStore } from '@/store/authStore';
import { rebaseLocalPlaybackPaths } from './rebaseLocalPlaybackPaths';

const entry = (localPath: string): LocalPlaybackEntry => ({
  serverIndexKey: 'srv', trackId: 't', localPath, layoutFingerprint: 'f', sizeBytes: 1,
  tier: 'ephemeral', cachedAt: 0, suffix: 'mp3',
});
const OLD = '/private/var/mobile/Containers/Data/Application/OLD/Library/Application Support/dev.psysonic.player/media/cache/srv/a.mp3';

describe('rebaseLocalPlaybackPaths', () => {
  beforeEach(() => {
    useAuthStore.setState({ mediaDir: '' });
    useLocalPlaybackStore.setState({ entries: { 'srv:t': entry(OLD) } });
  });

  it('points stored paths at the current app container after an update', async () => {
    expect(await rebaseLocalPlaybackPaths()).toBe(1);
    expect(useLocalPlaybackStore.getState().entries['srv:t'].localPath).toBe(
      '/var/mobile/Containers/Data/Application/NEW/Library/Application Support/dev.psysonic.player/media/cache/srv/a.mp3',
    );
  });

  it('leaves a user-chosen media folder alone', async () => {
    useAuthStore.setState({ mediaDir: '/Volumes/Music' });
    expect(await rebaseLocalPlaybackPaths()).toBe(0);
    expect(useLocalPlaybackStore.getState().entries['srv:t'].localPath).toBe(OLD);
  });
});
