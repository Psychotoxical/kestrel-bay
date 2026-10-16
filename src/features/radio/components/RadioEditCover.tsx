import { Cast } from 'lucide-react';
import type { InternetRadioStation } from '@/lib/api/subsonicTypes';
import { CoverArtImage } from '@/cover/CoverArtImage';
import { radioCoverRef } from '@/cover/ref';

interface Props {
  station: InternetRadioStation | null;
  /** Data URL of a newly picked image, shown before it is uploaded. */
  coverPreview: string | null;
  coverRemoved: boolean;
  size: number;
}

const FILL = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } as const;

/** The logo the station dialog shows: picked image, uploaded logo, or the cast placeholder. */
export default function RadioEditCover({ station, coverPreview, coverRemoved, size }: Props) {
  if (coverPreview) return <img src={coverPreview} alt="" style={FILL} />;
  if (!coverRemoved && station?.coverArt) {
    return (
      <CoverArtImage
        coverRef={radioCoverRef(station)}
        displayCssPx={size}
        surface="sparse"
        alt=""
        style={FILL}
      />
    );
  }
  return (
    <div className="album-card-cover-placeholder playlist-card-icon" style={{ width: '100%', height: '100%', borderRadius: 0 }}>
      <Cast size={Math.round((size * 36) / 140)} strokeWidth={1.2} />
    </div>
  );
}
