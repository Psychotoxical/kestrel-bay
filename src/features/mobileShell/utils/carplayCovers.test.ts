import { beforeEach, describe, expect, it, vi } from 'vitest';

const covers = vi.hoisted(() => ({
  peek: vi.fn(),
  ensure: vi.fn(async () => {}),
}));

vi.mock('@/lib/api/coverCache', () => ({
  coverCachePeekBatch: covers.peek,
  coverCacheEnsureBatch: covers.ensure,
}));
vi.mock('@/cover', () => ({
  coverServerScopeForServerId: () => ({ kind: 'active' }),
  coverStorageKeyFromRef: (ref: { fetchCoverArtId: string }, tier: number) => `${ref.fetchCoverArtId}:${tier}`,
  resolveAlbumCoverRefsFromLibrary: async (albums: Array<{ id: string }>) =>
    albums.map(album => ({ fetchCoverArtId: `al-${album.id}` })),
  resolveArtistCoverRefsFromLibrary: async (artists: Array<{ id: string }>) =>
    artists.map(artist => ({ fetchCoverArtId: `ar-${artist.id}` })),
}));

import { attachCarPlayCovers } from './carplayCovers';

const row = (id: string, kind: 'album' | 'artist' = 'album') => ({
  cover: { kind, id, serverId: 'srv' },
}) as { cover: { kind: 'album' | 'artist'; id: string; serverId: string }; image?: string };

describe('attachCarPlayCovers', () => {
  beforeEach(() => {
    covers.peek.mockReset();
    covers.ensure.mockClear();
  });

  it('puts covers already on disk straight onto the rows, without the version suffix', async () => {
    covers.peek.mockResolvedValue({ 'al-a:256': '/covers/a/256.webp|17', 'ar-b:256': '/covers/b/256.webp' });
    const sections = [{ items: [row('a'), row('b', 'artist')] }];
    const refresh = await attachCarPlayCovers(sections);
    expect(sections[0].items.map(item => item.image)).toEqual(['/covers/a/256.webp', '/covers/b/256.webp']);
    expect(refresh).toBeNull();
    expect(covers.ensure).not.toHaveBeenCalled();
  });

  it('downloads the missing covers afterwards and reports where they belong', async () => {
    covers.peek
      .mockResolvedValueOnce({ 'al-a:256': '/covers/a/256.webp' })
      .mockResolvedValueOnce({ 'al-c:256': '/covers/c/256.webp' });
    const sections = [{ items: [row('a')] }, { items: [{}, row('c')] }];
    const refresh = await attachCarPlayCovers(sections);
    expect(refresh).not.toBeNull();
    const updates = await refresh!();
    expect(covers.ensure).toHaveBeenCalledWith([{ fetchCoverArtId: 'al-c' }], 256);
    expect(updates).toEqual([{ section: 1, row: 1, image: '/covers/c/256.webp' }]);
  });
});
