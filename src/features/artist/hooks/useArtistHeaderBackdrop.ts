import type { SubsonicAlbum, SubsonicArtist } from '@/lib/api/subsonicTypes';
import type { CoverArtRef } from '@/cover/types';
import { useArtistBanner, useArtistFanart } from '@/cover/useArtistFanart';
import { backdropFromConfig } from '@/cover/artistBackdrop';
import { usePlaybackCoverArt } from '@/cover/usePlaybackCoverArt';
import { useCachedUrl } from '@/ui/CachedImage';
import { useThemeStore } from '@/store/themeStore';

/**
 * Artist-detail header background (§28): banner → fanart → Navidrome artist
 * cover, in the order the user configured for this surface. Shared by the
 * desktop hero and the touch hero.
 */
export function useArtistHeaderBackdrop(
  artist: SubsonicArtist,
  albums: SubsonicAlbum[],
  coverRef: CoverArtRef | null,
): { url: string; position?: string; enabled: boolean } {
  // Use the LOADED artist's id (not the route `id`), so the id, name and album
  // handed to the external-artwork hooks always describe the SAME artist. The
  // route `id` flips immediately on navigation while `artist`/`albums` refetch
  // a beat later — that mismatch previously wrote the previous artist's image
  // under the new artist's key (Sepultura's image under Lordi's id).
  const artistKey = artist.id;
  // An album from the artist's own list gives the §19 name→MusicBrainz fallback
  // the context it needs when the artist carries no Navidrome tag MBID.
  // Pick the first album that actually belongs to THIS artist. `albums` refetches
  // a beat after `artist` on navigation, so a stale album would run a mismatched
  // name→MusicBrainz query and could cache a wrong `no_mbid` for the new artist.
  const albumContext = albums.find((a) => a.artistId === artist.id)?.name;
  const banner = useArtistBanner(artistKey, {
    artistName: artist.name,
    albumTitle: albumContext,
  });
  const fanartBg = useArtistFanart(artistKey, {
    artistName: artist.name,
    albumTitle: albumContext,
  });
  // §28 stage 3: the Navidrome artist cover, the last fallback when neither an
  // external banner nor fanart exists. Resolved the same way the fullscreen
  // player resolves its artist background (`coverRef` is the artist cover ref).
  const ndArtist = usePlaybackCoverArt(coverRef ?? undefined, 2000, { fullRes: true });
  const ndArtistUrl = useCachedUrl(ndArtist.src, ndArtist.cacheKey, true);
  // Header background priority (§28): banner → fanart → Navidrome artist cover,
  // now user-configurable per surface. Shared with the mainstage hero via
  // backdropFromConfig so the two headers resolve and frame identically.
  const artistDetailBackdrop = useThemeStore((s) => s.backdrops.artistDetailHero);
  const headerBackdrop = backdropFromConfig(artistDetailBackdrop.sources, {
    banner,
    fanart: fanartBg,
    navidrome: ndArtistUrl,
  });
  return { ...headerBackdrop, enabled: artistDetailBackdrop.enabled };
}
