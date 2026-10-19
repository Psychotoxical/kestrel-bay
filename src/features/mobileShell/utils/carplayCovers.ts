import { coverCacheEnsureBatch, coverCachePeekBatch } from '@/lib/api/coverCache';
import {
  albumCoverRef,
  coverServerScopeForServerId,
  coverStorageKeyFromRef,
  resolveAlbumCoverRefsFromLibrary,
  resolveArtistCoverRefsFromLibrary,
  type CoverArtRef,
} from '@/cover';

/** Row thumbnails in CarPlay are small; this tier is sharp on every car screen. */
const CARPLAY_COVER_TIER = 256;
/** Only the first rows get covers; CarPlay rarely shows more without scrolling far. */
const CARPLAY_COVER_ROWS = 60;

/** The entity whose cover a row shows. */
export interface CarPlayCoverSource {
  kind: 'album' | 'artist' | 'playlist';
  id: string;
  coverArt?: string;
  serverId: string;
}

/** A cover that arrived after the list was sent. */
export interface CarPlayCoverUpdate {
  section: number;
  row: number;
  image: string;
}

interface CoverRow {
  section: number;
  row: number;
  ref: CoverArtRef;
}

interface CoverTarget {
  cover?: CarPlayCoverSource;
  image?: string;
}

/** Cover-cache paths carry a `|<version>` suffix for the web layer; native wants the file. */
function bareCoverPath(path: string): string {
  const sep = path.lastIndexOf('|');
  return sep >= 0 && /^\d+$/.test(path.slice(sep + 1)) ? path.slice(0, sep) : path;
}

async function refFor(cover: CarPlayCoverSource): Promise<CoverArtRef | null> {
  const scope = coverServerScopeForServerId(cover.serverId);
  // A playlist's cover is the server's collage, keyed by its cover id like the
  // playlist cards do (no library lookup: the index holds no playlist covers).
  if (cover.kind === 'playlist') {
    return cover.coverArt ? albumCoverRef(cover.coverArt, cover.coverArt, scope) : null;
  }
  const entity = [{ id: cover.id, coverArt: cover.coverArt }];
  const refs = cover.kind === 'album'
    ? await resolveAlbumCoverRefsFromLibrary(entity, scope)
    : await resolveArtistCoverRefsFromLibrary(entity, scope);
  return refs[0]?.fetchCoverArtId ? refs[0] : null;
}

async function peekImages(rows: CoverRow[]): Promise<Map<CoverRow, string>> {
  const found = new Map<CoverRow, string>();
  if (rows.length === 0) return found;
  const paths = await coverCachePeekBatch(rows.map(row => row.ref), CARPLAY_COVER_TIER).catch(() => ({}));
  for (const row of rows) {
    const path = (paths as Record<string, string>)[coverStorageKeyFromRef(row.ref, CARPLAY_COVER_TIER)];
    if (path) found.set(row, bareCoverPath(path));
  }
  return found;
}

/**
 * Sets `image` on rows whose cover is already on disk (no network), and returns a
 * follow-up that downloads the missing ones and reports them, or null when none
 * are missing.
 */
export async function attachCarPlayCovers(
  sections: ReadonlyArray<{ items: CoverTarget[] }>,
): Promise<(() => Promise<CarPlayCoverUpdate[]>) | null> {
  const pending: Array<Promise<CoverRow | null>> = [];
  sections.forEach((section, sectionIndex) => {
    section.items.slice(0, CARPLAY_COVER_ROWS).forEach((item, rowIndex) => {
      if (!item.cover) return;
      pending.push(refFor(item.cover)
        .then(ref => (ref ? { section: sectionIndex, row: rowIndex, ref } : null))
        .catch(() => null));
    });
  });
  const rows = (await Promise.all(pending)).filter((row): row is CoverRow => row !== null);
  const onDisk = await peekImages(rows);
  for (const [row, image] of onDisk) sections[row.section].items[row.row].image = image;

  const missing = rows.filter(row => !onDisk.has(row));
  if (missing.length === 0) return null;
  return async () => {
    await coverCacheEnsureBatch(missing.map(row => row.ref), CARPLAY_COVER_TIER).catch(() => {});
    const fetched = await peekImages(missing);
    return [...fetched].map(([row, image]) => ({ section: row.section, row: row.row, image }));
  };
}
