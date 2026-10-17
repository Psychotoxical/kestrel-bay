import { useEffect, useRef, useState } from 'react';
import type { TFunction } from 'i18next';
import { Check, FolderOpen, Infinity as InfinityIcon, Link, MoreHorizontal, Save, Shuffle, Trash2 } from 'lucide-react';
import type { QueueDisplayMode } from '@/store/authStoreTypes';
import TransitionModeChips from '@/features/mobileShell/components/TransitionModeChips';
import CrossfadeLengthSlider from '@/features/mobileShell/components/CrossfadeLengthSlider';
import { QueueShareButton } from '@/features/queue/components/QueueShareButton';
import type { QueueShareController } from '@/features/queue/hooks/useQueueShare';

interface Props {
  activePlaylist: { id: string; name: string } | null;
  saveState: 'idle' | 'saving' | 'saved';
  shuffleMode: boolean;
  toggleShuffleMode: () => void;
  handleSave: () => void;
  handleLoad: () => void;
  handleClear: () => void;
  queueShare: QueueShareController;
  publicShareQueueActive: boolean;
  infiniteQueueEnabled: boolean;
  setInfiniteQueueEnabled: (v: boolean) => void;
  queueDisplayMode: QueueDisplayMode;
  setQueueDisplayMode: (v: QueueDisplayMode) => void;
  /** Show the transition modes, crossfade length and infinite queue as a row (the Orbit room).
   *  Otherwise transitions live in the player's options sheet and infinite queue in the menu. */
  showPlaybackModes?: boolean;
  onClose?: () => void;
  t: TFunction;
}

const MODES: ReadonlyArray<{ mode: QueueDisplayMode; labelKey: string }> = [
  { mode: 'queue', labelKey: 'queue.title' },
  { mode: 'playlist', labelKey: 'queue.modePlaylist' },
  { mode: 'timeline', labelKey: 'queue.modeTimeline' },
];

/**
 * Touch header of the queue sheet: title with an actions menu (shuffle,
 * infinite queue, playlist save/load, share link, clear) and the close button,
 * and the queue / playlist / timeline switch. The Orbit room adds the row of
 * transition modes; elsewhere those sit behind the player's options arrow.
 */
export function QueueTouchHeader({
  activePlaylist, saveState, shuffleMode, toggleShuffleMode, handleSave, handleLoad, handleClear,
  queueShare, publicShareQueueActive, infiniteQueueEnabled, setInfiniteQueueEnabled,
  queueDisplayMode, setQueueDisplayMode, showPlaybackModes = false, onClose, t,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || menuBtnRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menuOpen]);

  const pick = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className="queue-touch-header">
      <div className="queue-touch-header__row">
        <h2 className="queue-touch-header__title">{t('queue.title')}</h2>
        <div className="queue-touch-header__actions">
          {queueShare.sharePickerOpen && (
            <QueueShareButton
              label={publicShareQueueActive ? t('queue.shareNavidromePublic') : t('queue.shareQueue')}
              open={queueShare.sharePickerOpen}
              options={queueShare.serverOptions}
              initialServerId={queueShare.defaultServerId}
              onTrigger={() => { void queueShare.handleCopy(); }}
              onClose={queueShare.closeSharePicker}
              onShare={queueShare.shareForServer}
            />
          )}
          <button
            ref={menuBtnRef}
            type="button"
            className={`mobile-round-btn queue-touch-header__menu-btn${menuOpen ? ' is-active' : ''}`}
            aria-label={t('player.moreOptions')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(v => !v)}
          >
            <MoreHorizontal size={20} aria-hidden="true" />
          </button>
          {onClose && (
            <button type="button" className="mobile-pill-btn" onClick={onClose}>
              {t('common.close')}
            </button>
          )}
          {menuOpen && (
            <div ref={menuRef} className="queue-touch-menu" role="menu">
              <button type="button" role="menuitemcheckbox" aria-checked={shuffleMode} className="queue-touch-menu__item" onClick={pick(toggleShuffleMode)}>
                <span>{t('queue.shuffle')}</span>
                {shuffleMode ? <Check size={19} aria-hidden="true" /> : <Shuffle size={19} aria-hidden="true" />}
              </button>
              {!showPlaybackModes && (
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={infiniteQueueEnabled}
                  className="queue-touch-menu__item"
                  onClick={pick(() => setInfiniteQueueEnabled(!infiniteQueueEnabled))}
                >
                  <span>{t('queue.infiniteQueue')}</span>
                  {infiniteQueueEnabled ? <Check size={19} aria-hidden="true" /> : <InfinityIcon size={19} aria-hidden="true" />}
                </button>
              )}
              {!publicShareQueueActive && (
                <button type="button" role="menuitem" className="queue-touch-menu__item" onClick={pick(handleSave)} disabled={saveState === 'saving'}>
                  <span>{activePlaylist ? `${t('queue.updatePlaylist')}: ${activePlaylist.name}` : t('queue.savePlaylist')}</span>
                  {saveState === 'saved' ? <Check size={19} aria-hidden="true" /> : <Save size={19} aria-hidden="true" />}
                </button>
              )}
              <button type="button" role="menuitem" className="queue-touch-menu__item" onClick={pick(handleLoad)}>
                <span>{t('queue.loadPlaylist')}</span>
                <FolderOpen size={19} aria-hidden="true" />
              </button>
              <button type="button" role="menuitem" className="queue-touch-menu__item" onClick={pick(() => { void queueShare.handleCopy(); })}>
                <span>{publicShareQueueActive ? t('queue.shareNavidromePublic') : t('queue.shareQueue')}</span>
                <Link size={19} aria-hidden="true" />
              </button>
              <button type="button" role="menuitem" className="queue-touch-menu__item queue-touch-menu__item--danger" onClick={pick(handleClear)}>
                <span>{t('queue.clear')}</span>
                <Trash2 size={19} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      {showPlaybackModes && (
        <>
          <TransitionModeChips layout="segmented">
            <button
              type="button"
              className={`mobile-transition-bar__toggle${infiniteQueueEnabled ? ' is-active' : ''}`}
              aria-pressed={infiniteQueueEnabled}
              aria-label={t('queue.infiniteQueue')}
              title={t('queue.infiniteQueue')}
              onClick={() => setInfiniteQueueEnabled(!infiniteQueueEnabled)}
            >
              <InfinityIcon size={20} strokeWidth={1.9} aria-hidden="true" />
            </button>
          </TransitionModeChips>
          <CrossfadeLengthSlider />
        </>
      )}

      <div className="mobile-segmented" role="tablist" aria-label={t('queue.title')}>
        {MODES.map(({ mode, labelKey }) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={queueDisplayMode === mode}
            className={`mobile-segmented__item${queueDisplayMode === mode ? ' is-active' : ''}`}
            onClick={() => setQueueDisplayMode(mode)}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
