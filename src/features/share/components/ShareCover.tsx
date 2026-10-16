import { Link2 } from 'lucide-react';
import { AlbumCoverArtImage } from '@/cover/AlbumCoverArtImage';
import { coverServerScopeForServerId } from '@/cover/serverScope';
import type { SubsonicShare } from '@/lib/api/subsonicSharing';
import { shareArtworkItems } from '@/features/share/sharePresentation';

/** First cover of a shared link (touch list row and sheet); a link icon when it has none. */
export default function ShareCover({ serverId, share, size }: { serverId: string; share: SubsonicShare; size: number }) {
  const art = shareArtworkItems(share)[0];
  if (!art) return <Link2 size={Math.round(size * 0.4)} aria-hidden="true" />;
  return (
    <AlbumCoverArtImage
      albumId={art.albumId}
      coverArt={art.coverArt}
      serverScope={coverServerScopeForServerId(serverId)}
      displayCssPx={size}
      surface="dense"
      className="mobile-share-cover__image"
      alt=""
    />
  );
}
