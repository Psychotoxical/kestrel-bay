import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { SubsonicAlbum, SubsonicArtist } from '@/lib/api/subsonicTypes';
import { renderWithProviders } from '@/test/helpers/renderWithProviders';
import { resetAllStores } from '@/test/helpers/storeReset';
import type { ArtistDetailHeroProps } from '@/features/artist/components/ArtistDetailHero';
import ArtistDetailHeroMobile from './ArtistDetailHeroMobile';

const artist = { id: 'ar1', name: 'Stormwind', albumCount: 2 } as SubsonicArtist;
const albums = [
  { id: 'al1', name: 'Taken by Storm', artist: 'Stormwind', artistId: 'ar1' },
  { id: 'al2', name: 'Rapture', artist: 'Stormwind', artistId: 'ar1' },
] as SubsonicAlbum[];

function setup(overrides: Partial<ArtistDetailHeroProps> = {}) {
  const props: ArtistDetailHeroProps = {
    artist,
    id: 'ar1',
    albums,
    info: null,
    isStarred: false,
    artistEntityRating: 0,
    handleArtistEntityRating: vi.fn(async () => {}),
    toggleStar: vi.fn(async () => {}),
    handlePlayAll: vi.fn(),
    handleShuffle: vi.fn(),
    handleEnqueueAll: vi.fn(),
    handleStartRadio: vi.fn(),
    handleImageUpload: vi.fn(async () => {}),
    playAllLoading: false,
    radioLoading: false,
    uploading: false,
    openedLink: null,
    openLink: vi.fn(),
    coverId: '',
    coverRef: null,
    coverRevision: 0,
    headerCoverFailed: false,
    setHeaderCoverFailed: vi.fn(),
    serverId: 'srv',
    ...overrides,
  };
  renderWithProviders(<ArtistDetailHeroMobile {...props} />, { route: '/artist/ar1' });
  return props;
}

describe('ArtistDetailHeroMobile', () => {
  beforeEach(() => { resetAllStores(); });

  it('puts play, shuffle and radio in one row; only play carries a label', () => {
    setup();
    const play = screen.getByRole('button', { name: 'Play' });
    const row = play.parentElement as HTMLElement;
    const shuffle = screen.getByRole('button', { name: 'Shuffle' });
    const radio = screen.getByRole('button', { name: 'Radio' });
    expect(shuffle.parentElement).toBe(row);
    expect(radio.parentElement).toBe(row);
    expect(play).toHaveTextContent('Play');
    expect(shuffle).toHaveTextContent('');
    expect(radio).toHaveTextContent('');
  });

  it('each button starts its own action', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Shuffle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Radio' }));
    expect(props.handlePlayAll).toHaveBeenCalledTimes(1);
    expect(props.handleShuffle).toHaveBeenCalledTimes(1);
    expect(props.handleStartRadio).toHaveBeenCalledTimes(1);
  });

  it('the radio button waits while a radio is being built', () => {
    setup({ radioLoading: true });
    const radio = screen.getByRole('button', { name: 'Loading…' });
    expect(radio).toBeDisabled();
    expect(radio).toHaveAttribute('aria-busy', 'true');
  });

  it('the more menu no longer offers radio', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Radio/ })).not.toBeInTheDocument();
  });

  it('an artist without albums still gets a labelled radio button', () => {
    const props = setup({ albums: [] });
    expect(screen.queryByRole('button', { name: 'Play' })).not.toBeInTheDocument();
    const radio = screen.getByRole('button', { name: 'Radio' });
    expect(radio).toHaveTextContent('Radio');
    fireEvent.click(radio);
    expect(props.handleStartRadio).toHaveBeenCalledTimes(1);
  });
});
