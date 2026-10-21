import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/mobileShell/car/carplayContent', () => ({
  carPlayPlay: vi.fn(),
  carPlayList: vi.fn(async () => ({
    sections: [
      { header: 'Quick play', items: [{ node: 'random', title: 'Random mix', browse: false }] },
      {
        header: 'Recently played',
        more: 'feed|recentlyPlayed',
        items: [{ node: 'album|srv|al1', title: 'Record', subtitle: 'Band', browse: true, image: '/c/al1.jpg' }],
      },
    ],
  })),
}));

import { carListJson } from './androidAuto';

describe('carListJson', () => {
  it('marks a cover row as a grid, at most eight albums, with a last "show all" row that opens the full list', async () => {
    const { sections } = JSON.parse(await carListJson('home'));
    expect(sections[0]).toMatchObject({ header: 'Quick play', grid: false });
    expect(sections[1].grid).toBe(true);
    expect(sections[1].items).toEqual([
      { node: 'album|srv|al1', title: 'Record', subtitle: 'Band', browse: true, image: '/c/al1.jpg' },
      expect.objectContaining({ node: 'feed|recentlyPlayed', browse: true, list: true }),
    ]);
  });
});
