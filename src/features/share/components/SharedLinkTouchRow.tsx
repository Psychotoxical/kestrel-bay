import { ChevronRight, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SubsonicShare } from '@/lib/api/subsonicSharing';
import { shareTouchDetails, shareTouchTitle } from '@/features/share/sharePresentation';
import ShareCover from '@/features/share/components/ShareCover';

interface Props {
  serverId: string;
  share: SubsonicShare;
  onOpen: () => void;
}

/** Touch list row of a shared link: cover, name, details and visits; tap opens the link's sheet. */
export default function SharedLinkTouchRow({ serverId, share, onOpen }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  return (
    <button type="button" className="mobile-share-row" onClick={onOpen}>
      <span className="mobile-share-cover mobile-share-row__cover">
        <ShareCover serverId={serverId} share={share} size={52} />
      </span>
      <span className="mobile-share-row__text">
        <span className="mobile-share-row__title">{shareTouchTitle(share, t)}</span>
        <span className="mobile-share-row__sub">
          <span className="mobile-share-row__details">{shareTouchDetails(share, t, locale)}</span>
          {typeof share.visitCount === 'number' && (
            <span className="mobile-share-row__visits">
              <Eye size={13} aria-hidden="true" />
              <span className="visually-hidden">{t('shared.visits')}: </span>
              {share.visitCount}
            </span>
          )}
        </span>
      </span>
      <ChevronRight size={18} className="mobile-share-row__chevron" aria-hidden="true" />
    </button>
  );
}
