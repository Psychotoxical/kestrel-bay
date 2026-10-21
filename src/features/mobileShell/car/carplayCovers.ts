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
/**
 * Rows that get covers: every row of the longest list (200). With only the first 60, an
 * album list showed no covers further down, however long it stayed open (car test 21.10.).
 */
const CARPLAY_COVER_ROWS = 200;
/**
 * Rows whose covers are looked up before the list is sent; the rest follow with the
 * downloads. Looking all 200 up first kept an Android phone past the car's 10 s, and the
 * list stayed empty (car test 21.10.).
 */
const CARPLAY_COVER_ROWS_FIRST = 60;
/** Missing covers download in chunks, so the first rows show theirs before the rest are in. */
const COVER_CHUNK = 24;

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
  // A playlist's (or radio station's) cover is the server's image, keyed by its cover id like the
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

/** Downloads the missing covers chunk by chunk, top rows first, reporting each chunk. */
export type CarPlayCoverRefresh = (onImages: (updates: CarPlayCoverUpdate[]) => void) => Promise<void>;

/**
 * Sets `image` on rows whose cover is already on disk (no network), and returns a
 * follow-up that downloads the missing ones and reports them, or null when none
 * are missing.
 */
export async function attachCarPlayCovers(
  sections: ReadonlyArray<{ items: CoverTarget[] }>,
): Promise<CarPlayCoverRefresh | null> {
  const first: Array<{ section: number; row: number; cover: CarPlayCoverSource }> = [];
  const later: typeof first = [];
  sections.forEach((section, sectionIndex) => {
    section.items.slice(0, CARPLAY_COVER_ROWS).forEach((item, rowIndex) => {
      if (!item.cover) return;
      (rowIndex < CARPLAY_COVER_ROWS_FIRST ? first : later)
        .push({ section: sectionIndex, row: rowIndex, cover: item.cover });
    });
  });
  const resolve = async (targets: typeof first): Promise<CoverRow[]> =>
    (await Promise.all(targets.map(target => refFor(target.cover)
      .then(ref => (ref ? { section: target.section, row: target.row, ref } : null))
      .catch(() => null))))
      .filter((row): row is CoverRow => row !== null);

  const rows = await resolve(first);
  const onDisk = await peekImages(rows);
  for (const [row, image] of onDisk) sections[row.section].items[row.row].image = image;

  const missing = rows.filter(row => !onDisk.has(row));
  if (missing.length === 0 && later.length === 0) return null;
  return async onImages => {
    // Rows further down: covers already on disk go straight out, the rest join the downloads.
    if (later.length > 0) {
      const laterRows = await resolve(later);
      const laterOnDisk = await peekImages(laterRows);
      if (laterOnDisk.size > 0) {
        onImages([...laterOnDisk].map(([row, image]) => ({ section: row.section, row: row.row, image })));
      }
      missing.push(...laterRows.filter(row => !laterOnDisk.has(row)));
    }
    for (let start = 0; start < missing.length; start += COVER_CHUNK) {
      const chunk = missing.slice(start, start + COVER_CHUNK);
      await coverCacheEnsureBatch(chunk.map(row => row.ref), CARPLAY_COVER_TIER).catch(() => {});
      const fetched = await peekImages(chunk);
      if (fetched.size > 0) {
        onImages([...fetched].map(([row, image]) => ({ section: row.section, row: row.row, image })));
      }
    }
  };
}
