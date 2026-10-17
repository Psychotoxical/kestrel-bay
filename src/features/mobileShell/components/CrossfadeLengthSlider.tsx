import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { useOrbitStore } from '@/features/orbit';
import { getTransitionMode } from '@/features/playback';

/** Same range as the desktop crossfade popover (queue toolbar). */
const MIN_SECS = 0.1;
const MAX_SECS = 10;

/**
 * Crossfade length, shown under the mode chips while crossfade is the active
 * transition — the touch stand-in for the desktop right-click popover.
 */
export default function CrossfadeLengthSlider() {
  const { t, i18n } = useTranslation();
  const gaplessEnabled = useAuthStore(s => s.gaplessEnabled);
  const crossfadeEnabled = useAuthStore(s => s.crossfadeEnabled);
  const crossfadeTrimSilence = useAuthStore(s => s.crossfadeTrimSilence);
  const crossfadeSecs = useAuthStore(s => s.crossfadeSecs);
  const setCrossfadeSecs = useAuthStore(s => s.setCrossfadeSecs);
  const locked = useOrbitStore(s => s.role === 'guest' && (s.phase === 'active' || s.phase === 'joining'));

  if (getTransitionMode({ gaplessEnabled, crossfadeEnabled, crossfadeTrimSilence }) !== 'crossfade') return null;

  const value = crossfadeSecs.toLocaleString(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <label className="mobile-crossfade-length">
      <span className="mobile-crossfade-length__label">{t('queue.crossfade')}</span>
      <input
        type="range"
        min={MIN_SECS}
        max={MAX_SECS}
        step={0.1}
        value={crossfadeSecs}
        disabled={locked}
        onChange={e => setCrossfadeSecs(parseFloat(e.target.value))}
      />
      <span className="mobile-crossfade-length__value">{value} s</span>
    </label>
  );
}
