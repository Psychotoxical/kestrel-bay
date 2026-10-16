import { useMemo } from 'react';
import { PlayCircle } from 'lucide-react';
import { CoverArtImage } from '@/cover/CoverArtImage';
import { usePresenceCoverRef } from '@/cover/useLibraryCoverRef';
import { coverServerScopeForServerId } from '@/cover/serverScope';
import type { SubsonicNowPlaying } from '@/lib/api/subsonicTypes';

/**
 * Cover thumb for a presence row. Resolves via {@link usePresenceCoverRef} so a
 * multi-disc Navidrome album shows the disc the person is actually playing
 * (`dc-<albumId>:<disc>`), and single-disc / other servers show the shared album
 * cover — never the track's own `mf-*` art forced into the album cache slot.
 */
export default function PresenceCover({ stream }: { stream: SubsonicNowPlaying }) {
  const serverScope = useMemo(
    () => coverServerScopeForServerId(stream.serverId),
    [stream.serverId],
  );
  const coverRef = usePresenceCoverRef(
    { albumId: stream.albumId, discNumber: stream.discNumber, serverId: stream.serverId },
    serverScope,
  );
  if (!coverRef) {
    return <PlayCircle size={24} style={{ margin: '12px', color: 'var(--text-muted)' }} />;
  }
  return (
    <CoverArtImage
      coverRef={coverRef}
      displayCssPx={50}
      surface="sparse"
      alt="Cover"
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  );
}
