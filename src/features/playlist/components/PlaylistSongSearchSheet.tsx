import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, X } from 'lucide-react';
import type { SubsonicSong } from '@/lib/api/subsonicTypes';
import { usePlayerStore } from '@/features/playback';
import { songToTrack } from '@/lib/media/songToTrack';
import { formatTrackTime } from '@/lib/format/formatDuration';
import { OptionalBrowseTrackRowCoverThumb } from '@/cover/TrackRowCoverThumb';
import { MobileSheet } from '@/features/mobileShell';

interface Props {
  query: string;
  setQuery: (v: string) => void;
  searching: boolean;
  searchResults: SubsonicSong[];
  setSearchResults: React.Dispatch<React.SetStateAction<SubsonicSong[]>>;
  addSong: (song: SubsonicSong) => void;
  onClose: () => void;
}

/**
 * Touch shell: "Add songs" as a sheet instead of the inline desktop panel. One
 * tap adds a track (it then drops out of the results, as songs already in the
 * playlist are not offered); holding a row opens the track menu.
 */
export default function PlaylistSongSearchSheet({
  query, setQuery, searching, searchResults, setSearchResults, addSong, onClose,
}: Props) {
  const { t } = useTranslation();
  const openContextMenu = usePlayerStore(s => s.openContextMenu);

  return (
    <MobileSheet title={t('playlists.addSongs')} onClose={onClose} className="mobile-sheet--tall mobile-sheet--add-songs">
      <label className="mobile-add-songs__search">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          className="mobile-add-songs__input"
          placeholder={t('playlists.searchPlaceholder')}
          aria-label={t('playlists.searchPlaceholder')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        {query && (
          <button
            type="button"
            className="mobile-add-songs__clear"
            aria-label={t('search.clearLabel')}
            onClick={() => { setQuery(''); setSearchResults([]); }}
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
      </label>
      {searching && <div className="mobile-add-songs__status"><div className="spinner" /></div>}
      {!searching && query && searchResults.length === 0 && (
        <p className="mobile-add-songs__status">{t('playlists.noResults')}</p>
      )}
      {searchResults.length > 0 && (
        <div className="mobile-tracklist mobile-add-songs__list">
          {searchResults.map(song => (
            <div
              key={song.id}
              className="mobile-track"
              onContextMenu={e => {
                e.preventDefault();
                openContextMenu(e.clientX, e.clientY, songToTrack(song), 'album-song');
              }}
            >
              <button
                type="button"
                className="mobile-track__main"
                aria-label={`${t('playlists.addSong')}: ${song.title}`}
                onClick={() => addSong(song)}
              >
                <OptionalBrowseTrackRowCoverThumb song={song} size="dense" />
                <span className="mobile-track__text">
                  <span className="mobile-track__title">{song.title}</span>
                  <span className="mobile-track__artist">
                    {[song.artist, song.album].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="mobile-track__time">{formatTrackTime(song.duration ?? 0)}</span>
                <Plus size={22} className="mobile-add-songs__plus" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </MobileSheet>
  );
}
