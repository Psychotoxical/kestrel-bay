import { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AlbumCoverArtImage } from '@/cover/AlbumCoverArtImage';
import { coverServerScopeForServerId } from '@/cover/serverScope';
import type { SubsonicShare, SubsonicShareEntry } from '@/lib/api/subsonicSharing';
import { useRailScroll } from '@/lib/hooks/useRailScroll';
import { shareArtworkItems } from '@/features/share/sharePresentation';

interface ShareArtworkRailProps {
  serverId: string;
  share: SubsonicShare;
  onOpen: (entries: SubsonicShareEntry[], label: string) => void;
}

export default function ShareArtworkRail({ serverId, share, onOpen }: ShareArtworkRailProps) {
  const { t } = useTranslation();
  const items = shareArtworkItems(share);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { showLeft, showRight, measure, scrollByPage } = useRailScroll({
    scrollRef,
    itemCount: items.length,
    resetKey: `${serverId}:${share.id}`,
  });

  if (items.length === 0) return null;

  return (
    <div className="shared-link__artwork-section">
      <div className="shared-link__artwork-nav album-row-nav">
        <button
          type="button"
          className={`nav-btn ${!showLeft ? 'disabled' : ''}`}
          disabled={!showLeft}
          aria-label={t('shared.previousArtwork')}
          onClick={() => scrollByPage('left')}
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`nav-btn ${!showRight ? 'disabled' : ''}`}
          disabled={!showRight}
          aria-label={t('shared.nextArtwork')}
          onClick={() => scrollByPage('right')}
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="album-grid-wrapper">
        <div className="shared-link__artwork-rail" ref={scrollRef} onScroll={measure}>
          {items.map(item => (
            <button
              type="button"
              className="shared-link__artwork"
              key={item.albumId}
              aria-label={`${t('shared.contentsTitle')}: ${item.label}`}
              title={item.label}
              onClick={() => onOpen(item.entries, item.label)}
            >
              <AlbumCoverArtImage
                albumId={item.albumId}
                coverArt={item.coverArt}
                serverScope={coverServerScopeForServerId(serverId)}
                displayCssPx={96}
                surface="dense"
                className="shared-link__artwork-image"
                alt=""
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
