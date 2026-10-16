import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Share2 } from 'lucide-react';
import { useOutboundShareModel, type OutboundShareRequest } from '@/features/share';

export interface MobileMoreMenuAction {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Set for one-of-many choices (e.g. sort order): announced as a checked or unchecked option. */
  checked?: boolean;
}

/** Placeholder for the share entries: one per share method the user has enabled. */
export interface MobileMoreMenuShare {
  id: string;
  share: OutboundShareRequest;
}

export type MobileMoreMenuItem = MobileMoreMenuAction | MobileMoreMenuShare;

const NO_SHARE: OutboundShareRequest = { kind: 'artist', resourceIds: [], serverIds: [] };

function isShare(item: MobileMoreMenuItem): item is MobileMoreMenuShare {
  return 'share' in item;
}

/**
 * Round "…" button with a drop-down action list (the queue sheet's menu look).
 * Keeps a page's secondary actions out of sight until they are wanted. Share
 * entries come from the share model, so availability, Navidrome sharing and the
 * copied-link toasts behave exactly as in the desktop share button.
 */
export default function MobileMoreMenu({ items }: { items: MobileMoreMenuItem[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const shareSlot = items.find(isShare);
  const shareModel = useOutboundShareModel(shareSlot?.share ?? NO_SHARE, t);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const shareLabel = t('contextMenu.shareLink');
  const actions: MobileMoreMenuAction[] = items.flatMap(item => (isShare(item)
    ? shareModel.methods.map(method => ({
      id: `${item.id}:${method.id}`,
      label: shareModel.methods.length > 1 ? `${shareLabel} · ${method.label}` : shareLabel,
      icon: <Share2 size={19} aria-hidden="true" />,
      disabled: !method.available,
      onSelect: () => { void shareModel.share(method.id); },
    }))
    : [item]));

  if (actions.length === 0) return null;

  return (
    <div className="mobile-more-menu" ref={rootRef}>
      <button
        type="button"
        className={`mobile-round-btn${open ? ' is-active' : ''}`}
        aria-label={t('player.moreOptions')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <MoreHorizontal size={22} aria-hidden="true" />
      </button>
      {open && (
        <div className="queue-touch-menu mobile-more-menu__list" role="menu">
          {actions.map(action => (
            <button
              key={action.id}
              type="button"
              role={action.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={action.checked}
              className={`queue-touch-menu__item${action.danger ? ' queue-touch-menu__item--danger' : ''}`}
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              <span>{action.label}</span>
              {action.icon}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
