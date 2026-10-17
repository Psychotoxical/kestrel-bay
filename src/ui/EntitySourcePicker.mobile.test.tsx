/**
 * Touch shell: the source menu sits at fixed coordinates, so it closes as soon as
 * the page is touched or scrolled outside it (desktop counterpart in
 * `EntitySourcePicker.test.tsx`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { libraryResolveEntitySources, type LibraryEntitySourceDto } from '@/lib/api/library';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import EntitySourcePicker from '@/ui/EntitySourcePicker';

vi.mock('@/lib/api/library', () => ({
  libraryResolveEntitySources: vi.fn(),
}));

const resolveSources = vi.mocked(libraryResolveEntitySources);

const currentSource: LibraryEntitySourceDto = {
  serverId: 'server-a',
  id: 'artist-a',
  libraryId: 'music-a',
  priority: 0,
  durationSec: null,
  suffix: null,
  bitRate: null,
  sizeBytes: null,
  starredAt: null,
  userRating: null,
};

const alternateSource: LibraryEntitySourceDto = {
  ...currentSource,
  serverId: 'server-b',
  id: 'artist-b',
  libraryId: 'music-b',
  priority: 1,
};

const props = {
  entityType: 'artist' as const,
  anchorServerId: 'server-a',
  anchorId: 'artist-a',
  scopes: [
    { serverId: 'server-a', libraryId: 'music-a' },
    { serverId: 'server-b', libraryId: 'music-b' },
  ],
  servers: [
    { id: 'server-a', name: 'Primary', url: 'https://a.test', username: 'alice', password: 'secret' },
    { id: 'server-b', name: 'Archive', url: 'https://b.test', username: 'bob', password: 'secret' },
  ],
  musicFoldersByServer: {
    'server-a': [{ id: 'music-a', name: 'Main library' }],
    'server-b': [{ id: 'music-b', name: 'Lossless' }],
  },
  onSelect: vi.fn(),
};

async function renderOpen() {
  resolveSources.mockResolvedValue([currentSource, alternateSource]);
  renderWithProviders(<><EntitySourcePicker {...props} /><div data-testid="page">page</div></>);
  fireEvent.click(await screen.findByRole('button', { name: 'Available from 2 sources' }));
  expect(screen.getByRole('menu')).toBeInTheDocument();
}

beforeEach(() => {
  resolveSources.mockReset();
});

describe('EntitySourcePicker in the touch shell', () => {
  it('closes when the page scrolls', async () => {
    await renderOpen();
    fireEvent.scroll(screen.getByTestId('page'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on a touch outside, which is also how a swipe starts', async () => {
    await renderOpen();
    fireEvent.pointerDown(screen.getByTestId('page'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('stays open for touches and scrolling inside the menu', async () => {
    await renderOpen();
    const menu = screen.getByRole('menu');
    fireEvent.pointerDown(menu);
    fireEvent.scroll(menu);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('the trigger still toggles: a touch on it does not close and reopen', async () => {
    await renderOpen();
    const trigger = screen.getByRole('button', { name: 'Available from 2 sources' });
    fireEvent.pointerDown(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
