import type {
  SubsonicShare,
  SubsonicShareEntry,
  SubsonicShareKind,
} from '@/lib/api/subsonicSharing';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import type { TFunction } from 'i18next';

export function shareEntryLabel(entry: SubsonicShareEntry): string | null {
  for (const key of ['title', 'name', 'album', 'artist']) {
    const value = entry[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : null;
}

export function shareEntryIsAlbum(entry: SubsonicShareEntry): boolean {
  return entry.isDir === true
    || entry.type === 'album'
    || entry.mediaType === 'album'
    || (typeof entry.songCount === 'number' && entry.songCount > 0 && !entry.albumId);
}

export function shareResourceCount(share: SubsonicShare): number {
  return (share.entry ?? []).reduce((count, entry) => {
    if (shareEntryIsAlbum(entry) && typeof entry.songCount === 'number') {
      return count + Math.max(0, entry.songCount);
    }
    return count + 1;
  }, 0);
}

export function shareResourceSummary(share: SubsonicShare, t: TFunction): string {
  const count = shareResourceCount(share);
  return count === 0 ? t('shared.noResourceDetails') : t('shared.resources', { count });
}

export type DisplayShareKind = SubsonicShareKind | 'collection';

export function shareResourceKind(share: SubsonicShare): DisplayShareKind {
  if (share.resourceKind) return share.resourceKind;
  const entries = share.entry ?? [];
  if (entries.length === 1) return shareEntryIsAlbum(entries[0]!) ? 'album' : 'track';
  return 'collection';
}

export function shareResourceKindLabel(share: SubsonicShare, t: TFunction): string {
  return t(`shared.shareType.${shareResourceKind(share)}`);
}

export function shareEntryAsSong(entry: SubsonicShareEntry, serverId?: string): SubsonicSong | null {
  if (shareEntryIsAlbum(entry) || typeof entry.id !== 'string' || typeof entry.title !== 'string') return null;
  return {
    ...entry,
    id: entry.id,
    title: entry.title,
    artist: typeof entry.artist === 'string' ? entry.artist : '',
    album: typeof entry.album === 'string' ? entry.album : '',
    albumId: typeof entry.albumId === 'string' ? entry.albumId : '',
    duration: typeof entry.duration === 'number' ? entry.duration : 0,
    serverId,
  } as SubsonicSong;
}

export interface ShareArtworkItem {
  albumId: string;
  coverArt?: string;
  label: string;
  entries: SubsonicShareEntry[];
}

/** One cover per album in the share, in share order; tracks of the same album share one. */
export function shareArtworkItems(share: SubsonicShare): ShareArtworkItem[] {
  const items = new Map<string, ShareArtworkItem>();
  for (const entry of share.entry ?? []) {
    const id = typeof entry.id === 'string' ? entry.id : '';
    const albumId = shareEntryIsAlbum(entry)
      ? id
      : typeof entry.albumId === 'string' ? entry.albumId : id;
    if (!albumId) continue;
    const existing = items.get(albumId);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    const coverArt = typeof entry.coverArt === 'string' ? entry.coverArt : undefined;
    const entryLabel = shareEntryLabel(entry);
    const label = shareEntryIsAlbum(entry) && entryLabel
      ? entryLabel
      : typeof entry.album === 'string' && entry.album.trim()
        ? entry.album.trim()
        : entryLabel ?? albumId;
    items.set(albumId, { albumId, coverArt, label, entries: [entry] });
  }
  return [...items.values()];
}

function formatShareDay(value: string | undefined, locale: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(parsed);
}

/** Touch list name: a single album or track by its title, anything else by its kind ("Collection"). */
export function shareTouchTitle(share: SubsonicShare, t: TFunction): string {
  const entries = share.entry ?? [];
  const single = entries.length === 1 ? shareEntryLabel(entries[0]!) : null;
  return single ?? shareResourceKindLabel(share, t);
}

/** Touch list details, e.g. "Album · 10 items · Expires Oct 16, 2027": what the title does not already say. */
export function shareTouchDetails(share: SubsonicShare, t: TFunction, locale: string): string {
  const kindLabel = shareResourceKindLabel(share, t);
  const expires = formatShareDay(share.expires, locale);
  return [
    shareTouchTitle(share, t) !== kindLabel ? kindLabel : null,
    shareResourceKind(share) !== 'track' && shareResourceCount(share) > 0 ? shareResourceSummary(share, t) : null,
    expires ? `${t('shared.expires')} ${expires}` : null,
  ].filter(Boolean).join(' · ');
}
