import { Globe, Heart, Pencil, Play, Square, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { InternetRadioStation } from '@/lib/api/subsonicTypes';
import { MobileSheet } from '@/features/mobileShell';
import RadioStationCover from '@/features/radio/components/RadioStationCover';

interface Props {
  station: InternetRadioStation;
  onAir: boolean;
  isFavorite: boolean;
  subtitle?: string;
  /** Navidrome ≥ 0.62 only lets admins manage stations — hides edit/delete. */
  canManage: boolean;
  onToggle: () => void;
  onFavoriteToggle: () => void;
  onOpenHomepage: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Touch action sheet of one radio station (from "…" or a long press on its row). */
export default function RadioStationSheet({
  station, onAir, isFavorite, subtitle, canManage,
  onToggle, onFavoriteToggle, onOpenHomepage, onEdit, onDelete, onClose,
}: Props) {
  const { t } = useTranslation();
  return (
    <MobileSheet title={station.name} hideTitle onClose={onClose} className="mobile-sheet--radio">
      <div className="mobile-detail-sheet__hero">
        <span className="mobile-radio-cover mobile-detail-sheet__cover">
          <RadioStationCover station={station} size={84} />
        </span>
        <span className="mobile-detail-sheet__heading">
          <strong>{station.name}</strong>
          {subtitle && <span>{subtitle}</span>}
        </span>
      </div>

      <div className="mobile-detail-sheet__actions">
        <button type="button" className="btn btn-primary" onClick={onToggle}>
          {onAir ? <Square size={14} fill="currentColor" aria-hidden="true" /> : <Play size={16} fill="currentColor" aria-hidden="true" />}
          {t(onAir ? 'radio.stopStation' : 'radio.playStation')}
        </button>
        <button type="button" className="btn btn-surface" onClick={onFavoriteToggle} aria-pressed={isFavorite}>
          <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} aria-hidden="true" />
          {t(isFavorite ? 'radio.unfavorite' : 'radio.favorite')}
        </button>
      </div>

      {(station.homepageUrl || canManage) && (
        <div className="mobile-form-group">
          {station.homepageUrl && (
            <button type="button" className="mobile-form-group__row mobile-form-group__action" onClick={onOpenHomepage}>
              <span>{t('radio.openHomepage')}</span>
              <Globe size={18} aria-hidden="true" />
            </button>
          )}
          {canManage && (
            <button type="button" className="mobile-form-group__row mobile-form-group__action" onClick={onEdit}>
              <span>{t('radio.editStation')}</span>
              <Pencil size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {canManage && (
        <div className="mobile-form-group">
          <button
            type="button"
            className="mobile-form-group__row mobile-form-group__action mobile-form-group__action--danger"
            onClick={onDelete}
          >
            <span>{t('radio.deleteStation')}</span>
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </div>
      )}
    </MobileSheet>
  );
}
