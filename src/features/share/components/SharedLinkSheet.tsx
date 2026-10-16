import { useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, ListPlus, Loader2, Music, Play, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AlbumCoverArtImage } from '@/cover/AlbumCoverArtImage';
import { coverServerScopeForServerId } from '@/cover/serverScope';
import type { SubsonicShare } from '@/lib/api/subsonicSharing';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { songToTrack } from '@/lib/media/songToTrack';
import { formatTrackTime } from '@/lib/format/formatDuration';
import { MobileSheet } from '@/features/mobileShell';
import { usePlayerStore } from '@/features/playback';
import { loadShareSongs } from '@/features/share/loadShareSongs';
import { shareTouchDetails, shareTouchTitle } from '@/features/share/sharePresentation';
import ShareCover from '@/features/share/components/ShareCover';

function formatDateTime(value: string | undefined, locale: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

interface Props {
  serverId: string;
  share: SubsonicShare;
  /** Last copy/open/delete error for this link, shown in the sheet. */
  error?: string;
  deleting: boolean;
  onCopy: () => void;
  onOpenExternal: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Touch detail sheet of one shared link: play or queue it, copy or open the link,
 * see who shared it and when it expires, browse the contents (tap a track to play
 * from there) and delete the link. Replaces the desktop card's button row and the
 * separate contents dialog.
 */
export default function SharedLinkSheet({
  serverId, share, error, deleting, onCopy, onOpenExternal, onDelete, onClose,
}: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const [contents, setContents] = useState<{ loading: boolean; songs: SubsonicSong[]; failedEntries: number }>(
    { loading: true, songs: [], failedEntries: 0 },
  );

  useEffect(() => {
    let active = true;
    void loadShareSongs(serverId, share).then(next => {
      if (active) setContents({ ...next, loading: false });
    });
    return () => { active = false; };
  }, [serverId, share]);

  const playFrom = (index: number) => {
    const tracks = contents.songs.map(songToTrack);
    if (tracks[index]) usePlayerStore.getState().playTrack(tracks[index], tracks);
  };
  const enqueue = () => {
    if (contents.songs.length > 0) usePlayerStore.getState().enqueue(contents.songs.map(songToTrack));
  };
  const noSongs = contents.loading || contents.songs.length === 0;

  const info: Array<{ label: string; value: string | null | undefined; icon?: boolean }> = [
    { label: t('shared.owner'), value: share.username },
    { label: t('shared.created'), value: formatDateTime(share.created, locale) },
    { label: t('shared.expires'), value: formatDateTime(share.expires, locale) },
    { label: t('shared.lastOpened'), value: formatDateTime(share.lastVisited, locale) },
    { label: t('shared.visits'), value: typeof share.visitCount === 'number' ? String(share.visitCount) : null },
    {
      label: t('shared.downloads'),
      value: typeof share.downloadable === 'boolean' ? t(share.downloadable ? 'shared.allowed' : 'shared.blocked') : null,
      icon: share.downloadable === true,
    },
  ].filter(row => row.value);

  return (
    <MobileSheet
      title={shareTouchTitle(share, t)}
      hideTitle
      onClose={onClose}
      className="mobile-sheet--tall mobile-sheet--share"
    >
      <div className="mobile-detail-sheet__hero">
        <span className="mobile-share-cover mobile-detail-sheet__cover">
          <ShareCover serverId={serverId} share={share} size={84} />
        </span>
        <span className="mobile-detail-sheet__heading">
          <strong>{shareTouchTitle(share, t)}</strong>
          <span>{shareTouchDetails(share, t, locale)}</span>
        </span>
      </div>

      <div className="mobile-detail-sheet__actions">
        <button type="button" className="btn btn-primary" disabled={noSongs} onClick={() => playFrom(0)}>
          <Play size={16} fill="currentColor" aria-hidden="true" />
          {t('common.play')}
        </button>
        <button type="button" className="btn btn-surface" disabled={noSongs} onClick={enqueue}>
          <ListPlus size={16} aria-hidden="true" />
          {t('common.addToQueue')}
        </button>
      </div>

      {error && <div className="mobile-share-sheet__error" role="alert">{error}</div>}

      <div className="mobile-form-group">
        <button type="button" className="mobile-form-group__row mobile-form-group__action" onClick={onCopy}>
          <span>{t('shared.copy')}</span>
          <Copy size={18} aria-hidden="true" />
        </button>
        <button type="button" className="mobile-form-group__row mobile-form-group__action" onClick={onOpenExternal}>
          <span>{t('shared.openExternal')}</span>
          <ExternalLink size={18} aria-hidden="true" />
        </button>
      </div>

      {info.length > 0 && (
        <dl className="mobile-form-group mobile-share-sheet__info">
          {info.map(row => (
            <div className="mobile-form-group__row" key={row.label}>
              <dt>{row.label}</dt>
              <dd>
                {row.icon && <Download size={14} aria-hidden="true" />}
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      <section className="mobile-share-sheet__contents" aria-label={t('shared.contentsTitle')}>
        <h3 className="mobile-share-sheet__label">{t('shared.contentsTitle')}</h3>
        {contents.loading && <p className="mobile-share-sheet__state"><Loader2 size={16} className="spin" aria-hidden="true" />{t('common.loading')}</p>}
        {!contents.loading && contents.failedEntries > 0 && (
          <p className="mobile-share-sheet__state" role="alert">{t('shared.contentsLoadFailed')}</p>
        )}
        {!contents.loading && contents.songs.length === 0 && (
          <p className="mobile-share-sheet__state">{t('shared.contentsEmpty')}</p>
        )}
        {contents.songs.length > 0 && (
          <ol className="mobile-share-sheet__tracks">
            {contents.songs.map((song, index) => (
              <li key={`${song.id}:${index}`}>
                <button type="button" className="mobile-share-track" onClick={() => playFrom(index)}>
                  <span className="mobile-share-track__cover">
                    {song.coverArt || song.albumId ? (
                      <AlbumCoverArtImage
                        albumId={song.albumId || song.id}
                        coverArt={song.coverArt}
                        serverScope={coverServerScopeForServerId(serverId)}
                        displayCssPx={44}
                        surface="dense"
                        className="mobile-share-cover__image"
                        alt=""
                      />
                    ) : <Music size={16} aria-hidden="true" />}
                  </span>
                  <span className="mobile-share-track__text">
                    <span className="mobile-share-track__title">{song.title}</span>
                    <span className="mobile-share-track__sub">{[song.artist, song.album].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span className="mobile-share-track__time">{song.duration > 0 ? formatTrackTime(song.duration) : ''}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="mobile-form-group">
        <button
          type="button"
          className="mobile-form-group__row mobile-form-group__action mobile-form-group__action--danger"
          disabled={deleting}
          onClick={onDelete}
        >
          <span>{t('common.delete')}</span>
          {deleting ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Trash2 size={18} aria-hidden="true" />}
        </button>
      </div>
    </MobileSheet>
  );
}
