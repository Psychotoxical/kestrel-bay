import { useTranslation } from 'react-i18next';
import { Check, ChevronDown } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { LOUDNESS_LUFS_PRESETS } from '@/store/authStoreDefaults';
import type { NormalizationEngine } from '@/store/authStoreTypes';
import { chooseNormalizationEngine } from '@/store/normalizationEngineChoice';
import MobileMoreMenu from '@/features/mobileShell/components/MobileMoreMenu';

/** "−12 LUFS": a real minus sign, as the settings show the target. */
function lufsLabel(target: number): string {
  return `${target < 0 ? '−' : ''}${Math.abs(target)} LUFS`;
}

/** Loudest first, in the order Settings → Audio lists the targets. */
const LUFS_TARGETS = [...LOUDNESS_LUFS_PRESETS].sort((a, b) => b - a);

/**
 * Touch shell: the normalization engine as a segmented switch (Off /
 * ReplayGain / LUFS), switched exactly like Settings → Audio. While LUFS is on,
 * its segment shows the target and opens the list of targets (upward: the
 * switch sits at the bottom of the screen).
 */
export default function NormalizationEngineSwitch({ labelledBy }: { labelledBy: string }) {
  const { t } = useTranslation();
  const engine = useAuthStore(s => s.normalizationEngine);
  const target = useAuthStore(s => s.loudnessTargetLufs);
  const setTarget = useAuthStore(s => s.setLoudnessTargetLufs);
  const options: { engine: NormalizationEngine; label: string }[] = [
    { engine: 'off', label: t('settings.normalizationOff') },
    { engine: 'replaygain', label: t('settings.normalizationReplayGain') },
  ];
  const segmentClass = (active: boolean) => `mobile-segmented__item${active ? ' is-active' : ''}`;

  return (
    <div className="mobile-segmented" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map(option => (
        <button
          key={option.engine}
          type="button"
          role="radio"
          aria-checked={engine === option.engine}
          className={segmentClass(engine === option.engine)}
          onClick={() => chooseNormalizationEngine(option.engine)}
        >
          {option.label}
        </button>
      ))}
      {engine === 'loudness' ? (
        <MobileMoreMenu
          className="mobile-more-menu--segment"
          placement="above"
          items={LUFS_TARGETS.map(value => ({
            id: String(value),
            label: lufsLabel(value),
            checked: value === target,
            icon: value === target
              ? <Check size={17} aria-hidden="true" />
              : <span className="mobile-more-menu__icon-gap" />,
            onSelect: () => { if (value !== target) setTarget(value); },
          }))}
          trigger={({ toggle }) => (
            <button
              type="button"
              role="radio"
              aria-checked="true"
              className={`${segmentClass(true)} mobile-segmented__item--menu`}
              onClick={toggle}
            >
              <span>{lufsLabel(target)}</span>
              <ChevronDown size={15} aria-hidden="true" />
            </button>
          )}
        />
      ) : (
        <button
          type="button"
          role="radio"
          aria-checked="false"
          className={segmentClass(false)}
          onClick={() => chooseNormalizationEngine('loudness')}
        >
          {t('settings.normalizationLufs')}
        </button>
      )}
    </div>
  );
}
