import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { SubsonicAlbum } from '@/lib/api/subsonicTypes';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import { useHomeStore } from '@/features/home/store/homeStore';
import type { OfflinePlayableCatalog } from '@/features/home/utils/offlinePlayableCatalog';

const offline = vi.hoisted(() => ({
  active: false,
  catalog: null as OfflinePlayableCatalog | null,
}));

vi.mock('@/features/offline', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/offline')>()),
  useOfflineBrowseActive: () => offline.active,
}));
vi.mock('@/features/home/hooks/useOfflinePlayableCatalog', () => ({
  useOfflinePlayableCatalog: () => offline.catalog,
}));
vi.mock('@/features/home/pages/Home', () => ({ default: () => <p>Full Mainstage</p> }));
vi.mock('@/features/home/components/Hero', () => ({
  default: ({ albums }: { albums: SubsonicAlbum[] }) => (
    <div data-testid="hero">{albums.map(a => a.name).join(', ')}</div>
  ),
}));
vi.mock('@/features/album', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/album')>()),
  AlbumRow: ({ title, titleLink, albums }: { title: string; titleLink?: string; albums: SubsonicAlbum[] }) => (
    albums.length === 0 ? null : (
      <section aria-label={title}>
        {titleLink && <a href={titleLink}>{title}</a>}
        {albums.map(a => <span key={a.id}>{a.name}</span>)}
      </section>
    )
  ),
}));

import TouchMainstage from './TouchMainstage';

const album = (id: string, name: string): SubsonicAlbum => ({
  id, name, artist: 'Kaltfront', artistId: 'ar1', songCount: 1, duration: 40, serverId: 'srv-a',
});
const STURMWARNUNG = album('a1', 'Sturmwarnung');
const SCHWERELOS = album('a2', 'Schwerelos');
const HAGEL = album('a3', 'Hagel');

describe('Mainstage in the touch shell', () => {
  beforeEach(() => {
    resetAllStores();
    offline.active = false;
    offline.catalog = {
      downloadedAlbums: [STURMWARNUNG, SCHWERELOS],
      recentlyPlayedAlbums: [HAGEL, STURMWARNUNG],
      albums: [STURMWARNUNG, SCHWERELOS, HAGEL],
    };
  });

  it('online it is the full Mainstage', () => {
    renderWithProviders(<TouchMainstage />);
    expect(screen.getByText('Full Mainstage')).toBeInTheDocument();
  });

  it('offline it shows only what plays from the device: downloads first, then recently played', () => {
    offline.active = true;
    renderWithProviders(<TouchMainstage />);
    expect(screen.queryByText('Full Mainstage')).not.toBeInTheDocument();
    expect(screen.getByTestId('hero')).toHaveTextContent('Sturmwarnung, Schwerelos');
    const downloaded = screen.getByRole('region', { name: 'Downloaded' });
    expect(within(downloaded).getByRole('link', { name: 'Downloaded' })).toHaveAttribute('href', '/offline');
    expect(within(downloaded).getByText('Schwerelos')).toBeInTheDocument();
    const played = screen.getByRole('region', { name: 'Recently Played' });
    expect(within(played).getByText('Hagel')).toBeInTheDocument();
  });

  it('offline with nothing on the device it says so', () => {
    offline.active = true;
    offline.catalog = { downloadedAlbums: [], recentlyPlayedAlbums: [], albums: [] };
    renderWithProviders(<TouchMainstage />);
    expect(screen.getByText(/Nothing downloaded yet/)).toBeInTheDocument();
    expect(screen.queryByTestId('hero')).not.toBeInTheDocument();
  });

  it('offline it keeps the sections the user hid hidden', () => {
    offline.active = true;
    useHomeStore.setState({
      sections: useHomeStore.getState().sections.map(s => (
        s.id === 'hero' || s.id === 'recentlyPlayed' ? { ...s, visible: false } : s
      )),
    });
    renderWithProviders(<TouchMainstage />);
    expect(screen.queryByTestId('hero')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Recently Played' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Downloaded' })).toBeInTheDocument();
  });
});
