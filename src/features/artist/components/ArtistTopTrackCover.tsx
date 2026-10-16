import React from 'react';
import { CoverArtImage } from '@/cover/CoverArtImage';
import { useAlbumCoverRef } from '@/cover/useLibraryCoverRef';
import { COVER_ARTIST_TOP_TRACK_CSS_PX } from '@/cover/layoutSizes';
import type { TopSongAlbumCoverSource } from '@/features/artist/components/topSongAlbumForCover';

/** Cover box of the touch track rows (`.mobile-track__cover`). */
const TOUCH_ROW_COVER_CSS_PX = 44;

const FIXED_STYLE: React.CSSProperties = {
  width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0,
};
// The touch row's box sets size and rounding; an inline 32 px would beat its CSS.
const FILL_STYLE: React.CSSProperties = {
  width: '100%', height: '100%', objectFit: 'cover', display: 'block',
};

/**
 * Album thumb — same cover ref path as {@link AlbumCard} on artist pages.
 * 32px in the desktop table; `fill` makes it fill the touch row's cover box.
 */
export default function ArtistTopTrackCover({ album, fill = false }: { album: TopSongAlbumCoverSource; fill?: boolean }) {
  const coverRef = useAlbumCoverRef(album.id, album.coverArt, undefined, { libraryResolve: false });
  if (!coverRef) return null;

  return (
    <CoverArtImage
      coverRef={coverRef}
      displayCssPx={fill ? TOUCH_ROW_COVER_CSS_PX : COVER_ARTIST_TOP_TRACK_CSS_PX}
      surface="dense"
      ensurePriority="high"
      ensureOpts={{ artistName: album.displayArtist ?? album.artist ?? '', albumTitle: album.name }}
      alt={`${album.name} Cover`}
      loading="eager"
      decoding="async"
      style={fill ? FILL_STYLE : FIXED_STYLE}
    />
  );
}
