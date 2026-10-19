import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronsRight, ListMusic, ListPlus, MoreHorizontal } from 'lucide-react';
import { usePlayerStore } from '@/features/playback';
import { AddToPlaylistSubmenu } from '@/features/contextMenu/components/ContextMenu';
import MobileSheet from './MobileSheet';
import type { Track } from '@/lib/media/trackTypes';
import { useMobileSelectionStore } from '../store/mobileSelectionStore';

/** Attribute on `<html>` while tracks are selected: the CSS swaps the bottom bars for the action bar. */
export const MOBILE_SELECTING_ATTR = 'data-mobile-selecting';

/**
 * The touch multi-selection's chrome: a header with the count and the button that ends the
 * selection, and in place of the player and tab bars an action bar (add to a playlist, play
 * next, add to the queue, and the multi-track menu for the rest). Leaving the page ends the
 * selection.
 */
export default function MobileSelectionBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const selected = useMobileSelectionStore(s => s.selected);
  const clear = useMobileSelectionStore(s => s.clear);
  // The picker belongs to the selection it was opened for; any change to it closes the sheet.
  const [playlistFor, setPlaylistFor] = useState<readonly Track[] | null>(null);
  const count = selected.length;

  useEffect(() => {
    clear();
  }, [pathname, clear]);

  useEffect(() => {
    const root = document.documentElement;
    if (count > 0) root.setAttribute(MOBILE_SELECTING_ATTR, '');
    else root.removeAttribute(MOBILE_SELECTING_ATTR);
    return () => root.removeAttribute(MOBILE_SELECTING_ATTR);
  }, [count]);

  if (count === 0) return null;

  // A playlist lives on one server, so a selection across servers has no target.
  const owners = new Set(selected.map(track => track.serverId).filter(Boolean));
  const playlistOwner = owners.size <= 1 ? selected[0]?.serverId : undefined;

  const run = (action: () => void) => {
    action();
    clear();
  };

  return (
    <>
      <div className="mobile-selection-header mobile-glass" role="toolbar" aria-label={t('contextMenu.selectedSongs', { count })}>
        <span className="mobile-selection-header__count" aria-live="polite">
          {t('contextMenu.selectedSongs', { count })}
        </span>
        <button type="button" className="mobile-pill-btn" onClick={clear}>
          {t('albums.cancelSelect')}
        </button>
      </div>
      <div className="mobile-selection-bar mobile-glass" role="toolbar">
        <button
          type="button"
          className="mobile-selection-bar__btn"
          disabled={owners.size > 1}
          onClick={() => setPlaylistFor(selected)}
        >
          <ListMusic size={22} aria-hidden="true" />
          <span>{t('contextMenu.addToPlaylist')}</span>
        </button>
        <button
          type="button"
          className="mobile-selection-bar__btn"
          onClick={() => run(() => usePlayerStore.getState().playNext(selected))}
        >
          <ChevronsRight size={22} aria-hidden="true" />
          <span>{t('contextMenu.playNext')}</span>
        </button>
        <button
          type="button"
          className="mobile-selection-bar__btn"
          onClick={() => run(() => usePlayerStore.getState().enqueue(selected))}
        >
          <ListPlus size={22} aria-hidden="true" />
          <span>{t('contextMenu.addToQueue')}</span>
        </button>
        <button
          type="button"
          className="mobile-selection-bar__btn"
          aria-haspopup="menu"
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            usePlayerStore.getState().openContextMenu(
              r.right, r.top, selected, 'multi-song',
              undefined, undefined, undefined, undefined, undefined, undefined, undefined, true,
            );
          }}
        >
          <MoreHorizontal size={22} aria-hidden="true" />
          <span>{t('player.moreOptions')}</span>
        </button>
      </div>
      {playlistFor === selected && (
        <MobileSheet
          title={t('contextMenu.addToPlaylist')}
          onClose={() => setPlaylistFor(null)}
          className="mobile-sheet--playlist-pick"
        >
          <AddToPlaylistSubmenu
            songIds={selected.map(track => track.id)}
            serverId={playlistOwner}
            dropDown
            onDone={clear}
          />
        </MobileSheet>
      )}
    </>
  );
}
