import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Blend, MoveRight, Waves, type LucideIcon } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useOrbitStore } from '@/features/orbit';
import {
  getTransitionMode,
  setTransitionMode,
  type TransitionMode,
} from '@/features/playback/utils/playback/playbackTransition';

const CHIPS: ReadonlyArray<{ mode: Exclude<TransitionMode, 'none'>; icon: LucideIcon; labelKey: string }> = [
  { mode: 'gapless', icon: MoveRight, labelKey: 'queue.gapless' },
  { mode: 'crossfade', icon: Waves, labelKey: 'queue.crossfade' },
  { mode: 'autodj', icon: Blend, labelKey: 'queue.autoDj' },
];

/**
 * Gapless / Crossfade / AutoDJ as one-tap chips. The modes are mutually
 * exclusive (see `playbackTransition`); tapping the active chip turns it off.
 */
export default function TransitionModeChips({ layout = 'wrap', children }: {
  /** `scroll`: one swipeable row (queue sheet); `wrap`: centred lines (player). */
  layout?: 'wrap' | 'scroll';
  /** Further chips appended after the three modes. */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const gaplessEnabled = useAuthStore(s => s.gaplessEnabled);
  const crossfadeEnabled = useAuthStore(s => s.crossfadeEnabled);
  const crossfadeTrimSilence = useAuthStore(s => s.crossfadeTrimSilence);
  const crossfadeSecs = useAuthStore(s => s.crossfadeSecs);
  const mode = getTransitionMode({ gaplessEnabled, crossfadeEnabled, crossfadeTrimSilence });
  // Transitions follow the host while a guest is in a live Orbit session.
  const locked = useOrbitStore(s => s.role === 'guest' && (s.phase === 'active' || s.phase === 'joining'));

  return (
    <div className={`mobile-chips mobile-chips--${layout}`} role="group" aria-label={t('settings.transitionsTitle')}>
      {CHIPS.map(({ mode: chipMode, icon: Icon, labelKey }) => {
        const active = mode === chipMode;
        const label = chipMode === 'crossfade'
          ? `${t(labelKey)} ${crossfadeSecs.toFixed(crossfadeSecs % 1 === 0 ? 0 : 1)} s`
          : t(labelKey);
        return (
          <button
            key={chipMode}
            type="button"
            className={`mobile-chip${active ? ' is-active' : ''}`}
            aria-pressed={active}
            disabled={locked}
            title={locked ? t('settings.transitionsHostControlled') : undefined}
            onClick={() => setTransitionMode(active ? 'none' : chipMode)}
          >
            <Icon size={17} strokeWidth={1.9} aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
      {children}
    </div>
  );
}
