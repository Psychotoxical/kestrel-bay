import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { ThemeStoreSection } from '@/features/settings/components/ThemeStoreSection';
import type { Registry } from '@/lib/themes/themeRegistry';

vi.mock('@/lib/themes/themeRegistry', () => ({
  fetchRegistry: vi.fn(),
  fetchThemeCss: vi.fn(async () => 'css'),
  assetUrl: (p: string) => `https://raw.example/${p}`,
  themeRequiresNewerApp: () => false,
}));

import { fetchRegistry } from '@/lib/themes/themeRegistry';

const REGISTRY: Registry = {
  schemaVersion: 1,
  generatedAt: '2026-06-07T00:00:00Z',
  themes: [1, 2, 3].map(i => ({
    id: `t${i}`, name: `Theme ${i}`, author: 'Tester', version: '1.0.0', description: `Description ${i}`,
    mode: 'dark' as const, css: `themes/t${i}/theme.css`, thumbnail: `themes/t${i}/thumb.png`, tags: [],
  })),
};

describe('ThemeStoreSection (touch shell)', () => {
  it('stacks each theme as a card: screenshot in full width on top, finger-sized buttons', async () => {
    vi.mocked(fetchRegistry).mockResolvedValue({ registry: REGISTRY, stale: false });
    const { container } = renderWithProviders(<ThemeStoreSection />);
    await screen.findAllByText('Theme 1');

    const row = container.querySelector<HTMLElement>('.theme-store-row')!;
    expect(row.style.flexDirection).toBe('column');
    const thumb = row.querySelector('img')!;
    expect(thumb.style.width).toBe('100%');
    const install = [...row.querySelectorAll<HTMLButtonElement>('button')].find(b => /Install/.test(b.textContent ?? ''))!;
    expect(install.style.fontSize).toBe('14px');
  });

  it('tells phone users that the themes are made for the desktop app', async () => {
    vi.mocked(fetchRegistry).mockResolvedValue({ registry: REGISTRY, stale: false });
    renderWithProviders(<ThemeStoreSection />);
    expect(await screen.findByText(/Themes are made for the desktop app/)).toBeInTheDocument();
  });
});
