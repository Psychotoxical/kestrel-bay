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

interface MobileMoreMenuProps {
  items: MobileMoreMenuItem[];
  /** Own trigger instead of the round "…" button (e.g. a segment that opens a choice list). */
  trigger?: (menu: { open: boolean; toggle: () => void }) => ReactNode;
  /** `above`: the list opens upward, for triggers near the bottom of the screen. */
  placement?: 'below' | 'above';
  /** Extra class on the root, e.g. to let it fill a grid cell. */
  className?: string;
}

/**
 * Round "…" button with a drop-down action list (the queue sheet's menu look).
 * Keeps a page's secondary actions out of sight until they are wanted. Share
 * entries come from the share model, so availability, Navidrome sharing and the
 * copied-link toasts behave exactly as in the desktop share button.
 */
export default function MobileMoreMenu({ items, trigger, placement = 'below', className }: MobileMoreMenuProps) {
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

  const toggle = () => setOpen(v => !v);
  const rootClass = [
    'mobile-more-menu',
    placement === 'above' ? 'mobile-more-menu--above' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClass} ref={rootRef}>
      {trigger ? trigger({ open, toggle }) : (
        <button
          type="button"
          className={`mobile-round-btn${open ? ' is-active' : ''}`}
          aria-label={t('player.moreOptions')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
        >
          <MoreHorizontal size={22} aria-hidden="true" />
        </button>
      )}
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
