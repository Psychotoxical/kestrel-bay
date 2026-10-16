import type { CoverArtId } from '@/cover/types';
import { AlbumCoverArtImage } from '@/cover/AlbumCoverArtImage';
import { PLAYLIST_MAIN_COVER_CSS_PX } from '@/features/playlist/hooks/usePlaylistCovers';
import { PlaylistSmartCoverCell } from '@/features/playlist/components/PlaylistCoverImages';

interface Props {
  /** Data URL of a newly picked image, shown before it is uploaded. */
  coverPreview: string | null;
  coverRemoved: boolean;
  customCoverId: string | null;
  coverQuadIds: (CoverArtId | null)[];
}

const FILL = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } as const;

/** The cover the edit dialog shows: picked image, uploaded cover, or the album grid. */
export default function PlaylistEditCover({ coverPreview, coverRemoved, customCoverId, coverQuadIds }: Props) {
  if (coverPreview) return <img src={coverPreview} alt="" style={FILL} />;
  if (!coverRemoved && customCoverId) {
    return (
      <AlbumCoverArtImage
        albumId={customCoverId}
        coverArt={customCoverId}
        displayCssPx={PLAYLIST_MAIN_COVER_CSS_PX}
        surface="dense"
        libraryResolve={false}
        alt=""
        style={FILL}
      />
    );
  }
  return (
    <div className="playlist-cover-grid" style={{ width: '100%', height: '100%' }}>
      {coverQuadIds.map((coverId, i) =>
        coverId
          ? <PlaylistSmartCoverCell key={i} coverId={coverId} />
          : <div key={i} className="playlist-cover-cell playlist-cover-cell--empty" />
      )}
    </div>
  );
}
