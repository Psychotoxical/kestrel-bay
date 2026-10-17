import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import type { NormalizationEngine } from '@/store/authStoreTypes';
import { chooseNormalizationEngine } from '@/store/normalizationEngineChoice';

/** "−12 LUFS": a real minus sign, as the settings show the target. */
function lufsLabel(target: number): string {
  return `${target < 0 ? '−' : ''}${Math.abs(target)} LUFS`;
}

/**
 * Touch shell: the normalization engine as a segmented switch (Off /
 * ReplayGain / LUFS), switched exactly like Settings → Audio. The LUFS target
 * itself stays in the settings; the active one shows on its segment.
 */
export default function NormalizationEngineSwitch({ labelledBy }: { labelledBy: string }) {
  const { t } = useTranslation();
  const engine = useAuthStore(s => s.normalizationEngine);
  const target = useAuthStore(s => s.loudnessTargetLufs);
  const options: { engine: NormalizationEngine; label: string }[] = [
    { engine: 'off', label: t('settings.normalizationOff') },
    { engine: 'replaygain', label: t('settings.normalizationReplayGain') },
    { engine: 'loudness', label: engine === 'loudness' ? lufsLabel(target) : t('settings.normalizationLufs') },
  ];

  return (
    <div className="mobile-segmented" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map(option => (
        <button
          key={option.engine}
          type="button"
          role="radio"
          aria-checked={engine === option.engine}
          className={`mobile-segmented__item${engine === option.engine ? ' is-active' : ''}`}
          onClick={() => chooseNormalizationEngine(option.engine)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
