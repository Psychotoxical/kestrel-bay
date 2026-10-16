import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOrbitStore } from '@/features/orbit/store/orbitStore';
import { useAuthStore } from '@/store/authStore';
import { buildOrbitShareLink } from '@/features/orbit/utils/orbit';
import { serverShareBaseUrl } from '@/lib/server/serverEndpoint';

interface Props {
  /** Omit to render the content inline (the touch shell puts it in a sheet, which handles closing). */
  anchorRef?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}

/**
 * Host-only popover anchored below the share button in the Orbit bar.
 * Surfaces the session invite link with a copy affordance. Lives on its
 * own so the participants popover can stay focused on participants.
 */
export default function OrbitSharePopover({ anchorRef, onClose }: Props) {
  const { t } = useTranslation();
  const sessionId = useOrbitStore(s => s.sessionId);
  const serverId = useOrbitStore(s => s.serverId);
  const server = useAuthStore(s => s.servers.find(candidate => candidate.id === serverId));
  const popRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const shareLink = sessionId && server
    ? buildOrbitShareLink(serverShareBaseUrl(server), sessionId)
    : null;

  useEffect(() => {
    if (!anchorRef) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (popRef.current?.contains(target)) return;
      if (anchorRef?.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [anchorRef, onClose]);

  const onCopy = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* silent */ }
  };

  if (!shareLink) return null;

  // React Compiler refs rule: ref read imperatively outside reactive rendering; not used to compute the render output.
  // eslint-disable-next-line react-hooks/refs
  const anchor = anchorRef?.current?.getBoundingClientRect();
  const style: React.CSSProperties | undefined = !anchorRef ? undefined : anchor
    ? {
        position: 'fixed',
        top:   anchor.bottom + 12,
        right: Math.max(8, window.innerWidth - anchor.right),
        zIndex: 9999,
      }
    : { display: 'none' };

  const content = (
    <div ref={popRef} className={anchorRef ? 'orbit-share-pop' : 'orbit-share-pop orbit-pop--inline'} style={style} role="menu">
      <div className="orbit-share-pop__label">{t('orbit.participantsInviteLabel')}</div>
      <div className="orbit-share-pop__row">
        <code className="orbit-share-pop__link">{shareLink}</code>
        <button
          type="button"
          className="orbit-share-pop__copy"
          onClick={onCopy}
          data-tooltip={copied ? t('orbit.tooltipCopied') : t('orbit.tooltipCopy')}
          aria-label={t('orbit.ariaCopyLink')}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
  );
  return anchorRef ? createPortal(content, document.body) : content;
}
