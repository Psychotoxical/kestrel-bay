import { Heart, MoreHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InternetRadioStation } from '@/lib/api/subsonicTypes';
import RadioStationCover from '@/features/radio/components/RadioStationCover';

interface Props {
  /** Position in the shown list (touch reordering reads it from `data-radio-idx`). */
  index: number;
  /** Drop line while another row is dragged over this one. */
  dropIndicator: 'before' | 'after' | null;
  station: InternetRadioStation;
  /** This station is the current radio stream. */
  isActive: boolean;
  isPlaying: boolean;
  isFavorite: boolean;
  /** Server name (several servers) or the station's web host. */
  subtitle?: string;
  onToggle: () => void;
  onFavoriteToggle: () => void;
  onMore: () => void;
}

/**
 * Touch list row of a radio station: one tap plays it (or stops it while it is
 * on air), the heart toggles the favorite, and "…" or a long press opens the
 * station sheet with homepage, edit and delete.
 */
export default function RadioStationTouchRow({
  index, dropIndicator, station, isActive, isPlaying, isFavorite, subtitle, onToggle, onFavoriteToggle, onMore,
}: Props) {
  const { t } = useTranslation();
  const onAir = isActive && isPlaying;
  return (
    <div
      className={[
        'mobile-radio-row',
        isActive ? 'is-active' : '',
        dropIndicator ? `drop-${dropIndicator}` : '',
      ].filter(Boolean).join(' ')}
      data-radio-idx={index}
      onContextMenu={e => { e.preventDefault(); onMore(); }}
    >
      <button
        type="button"
        className="mobile-radio-row__main"
        onClick={onToggle}
        aria-label={`${t(onAir ? 'radio.stopStation' : 'radio.playStation')}: ${station.name}`}
      >
        <span className="mobile-radio-cover mobile-radio-row__cover">
          <RadioStationCover station={station} size={52} />
          {onAir && <span className="mobile-radio-row__live">{t('radio.live')}</span>}
        </span>
        <span className="mobile-radio-row__text">
          <span className="mobile-radio-row__name">{station.name}</span>
          {subtitle && <span className="mobile-radio-row__sub">{subtitle}</span>}
        </span>
      </button>
      <button
        type="button"
        className={`mobile-radio-row__icon${isFavorite ? ' is-on' : ''}`}
        onClick={onFavoriteToggle}
        aria-label={t(isFavorite ? 'radio.unfavorite' : 'radio.favorite')}
        aria-pressed={isFavorite}
      >
        <Heart size={18} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="mobile-radio-row__icon"
        onClick={onMore}
        aria-label={t('player.moreOptions')}
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
