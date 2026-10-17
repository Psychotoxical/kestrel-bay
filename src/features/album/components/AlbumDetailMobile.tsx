import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Heart, MoreHorizontal, Play, Shuffle } from 'lucide-react';
import type { SubsonicAlbum, SubsonicOpenArtistRef, SubsonicSong } from '@/lib/api/subsonicTypes';
import type { Track } from '@/lib/media/trackTypes';
import { songToTrack } from '@/lib/media/songToTrack';
import { formatTrackTime } from '@/lib/format/formatDuration';
import { ownedEntityKey } from '@/lib/util/ownedEntityKey';
import { buildArtistDetailPath } from '@/lib/navigation/detailServerScope';
import { sameQueueTrack, usePlayerStore } from '@/features/playback';
import { prepareTransientUiOpen } from '@/lib/dom/transientUi';
import { MobileBackButton } from '@/features/mobileShell';
import AlbumCard from '@/features/album/components/AlbumCard';

interface Props {
  info: SubsonicAlbum;
  serverId: string;
  artistRefs: SubsonicOpenArtistRef[];
  songs: SubsonicSong[];
  coverUrl: string | null;
  isStarred: boolean;
  currentTrack: Track | null;
  isPlaying: boolean;
  relatedAlbums: SubsonicAlbum[];
  relatedTitle: string;
  onToggleStar: () => void;
  onPlayAll: () => void;
  onShuffleAll: () => void;
  onPlaySong: (song: SubsonicSong) => void;
}

function PlayingBars() {
  return (
    <span className="mobile-playing-bars" aria-hidden="true">
      <span /><span /><span />
    </span>
  );
}

/** Album page in the touch shell: big cover, play / shuffle, plain track list. */
export default function AlbumDetailMobile({
  info, serverId, artistRefs, songs, coverUrl, isStarred, currentTrack, isPlaying,
  relatedAlbums, relatedTitle, onToggleStar, onPlayAll, onShuffleAll, onPlaySong,
}: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openContextMenu = usePlayerStore(s => s.openContextMenu);
  const hasVariousArtists = songs.some(s => s.artist !== info.artist);
  const primaryArtist = artistRefs[0];

  const discs = useMemo(() => {
    const byDisc = new Map<number, SubsonicSong[]>();
    for (const song of songs) {
      const disc = song.discNumber ?? 1;
      const list = byDisc.get(disc);
      if (list) list.push(song);
      else byDisc.set(disc, [song]);
    }
    return [...byDisc.entries()].sort((a, b) => a[0] - b[0]);
  }, [songs]);
  const discTitles = useMemo(
    () => new Map((info.discTitles ?? []).map(d => [d.disc, d.title] as const)),
    [info.discTitles],
  );

  const firstSong = songs[0];
  const format = firstSong?.suffix
    ? `${firstSong.suffix.toUpperCase()}${firstSong.bitRate ? ` ${firstSong.bitRate} kbps` : ''}`
    : null;
  const meta = [info.genre, info.year, format].filter(Boolean).join(' · ');

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, item: unknown, type: 'album' | 'album-song') => {
    e.stopPropagation();
    prepareTransientUiOpen();
    const r = e.currentTarget.getBoundingClientRect();
    openContextMenu(r.right, r.bottom, item, type);
  };

  return (
    <div className="mobile-album">
      <div className="mobile-album__top">
        <MobileBackButton variant="round" />
        <div className="mobile-album__top-actions">
          <button
            type="button"
            className={`mobile-round-btn${isStarred ? ' is-active' : ''}`}
            onClick={onToggleStar}
            aria-pressed={isStarred}
            aria-label={isStarred ? t('albumDetail.favoriteRemove') : t('albumDetail.favoriteAdd')}
          >
            <Heart size={21} fill={isStarred ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mobile-round-btn"
            aria-label={t('player.moreOptions')}
            aria-haspopup="menu"
            onClick={e => openMenu(e, info, 'album')}
          >
            <MoreHorizontal size={22} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mobile-album__hero">
        <div className="mobile-album__cover">
          {coverUrl ? <img src={coverUrl} alt="" /> : null}
        </div>
        <h1 className="mobile-album__title">{info.name}</h1>
        {primaryArtist && (
          <button
            type="button"
            className="mobile-album__artist"
            onClick={() => primaryArtist.id && navigate(buildArtistDetailPath(primaryArtist.id, { serverId }))}
          >
            {artistRefs.map(a => a.name).filter(Boolean).join(', ')}
          </button>
        )}
        {meta && <span className="mobile-album__meta">{meta}</span>}
      </div>

      <div className="mobile-album__buttons">
        <button type="button" className="mobile-album__btn mobile-album__btn--primary" onClick={onPlayAll}>
          <Play size={18} fill="currentColor" aria-hidden="true" />
          {t('common.play')}
        </button>
        <button type="button" className="mobile-album__btn" onClick={onShuffleAll}>
          <Shuffle size={19} aria-hidden="true" />
          {t('albumDetail.shuffle')}
        </button>
      </div>

      {discs.map(([disc, discSongs]) => (
        <section key={disc} className="mobile-album__disc">
          {discs.length > 1 && (
            <h2 className="mobile-album__disc-title">
              CD {disc}{discTitles.get(disc) ? ` · ${discTitles.get(disc)}` : ''}
            </h2>
          )}
          <ol className="mobile-tracklist">
            {discSongs.map(song => {
              const active = sameQueueTrack(currentTrack, song);
              return (
                <li key={ownedEntityKey(song)} className={`mobile-track${active ? ' is-active' : ''}`}>
                  <button
                    type="button"
                    className="mobile-track__main"
                    onClick={() => onPlaySong(song)}
                    aria-current={active ? 'true' : undefined}
                  >
                    <span className="mobile-track__num">
                      {active && isPlaying ? <PlayingBars /> : song.track ?? ''}
                    </span>
                    <span className="mobile-track__text">
                      <span className="mobile-track__title">{song.title}</span>
                      {hasVariousArtists && <span className="mobile-track__artist">{song.artist}</span>}
                    </span>
                    <span className="mobile-track__time">{formatTrackTime(song.duration ?? 0)}</span>
                  </button>
                  <button
                    type="button"
                    className="mobile-track__more"
                    aria-label={`${t('player.moreOptions')}: ${song.title}`}
                    aria-haspopup="menu"
                    onClick={e => openMenu(e, songToTrack(song), 'album-song')}
                  >
                    <MoreHorizontal size={20} aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {relatedAlbums.length > 0 && (
        <section className="mobile-album__related">
          <h2 className="mobile-section-title">{relatedTitle}</h2>
          <div className="album-grid-wrap">
            {relatedAlbums.map(a => <AlbumCard key={ownedEntityKey(a)} album={a} />)}
          </div>
        </section>
      )}
    </div>
  );
}
