import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';
import TransitionModeChips from '@/features/mobileShell/components/TransitionModeChips';
import CrossfadeLengthSlider from '@/features/mobileShell/components/CrossfadeLengthSlider';
import NormalizationEngineSwitch from '@/features/mobileShell/components/NormalizationEngineSwitch';

interface Props {
  /** Internet radio plays: track transitions do not apply, only normalization. */
  radio: boolean;
  onClose: () => void;
}

/**
 * Player options behind the small arrow under the transport: track transitions
 * (gapless / crossfade with its length / AutoDJ) and normalization, in one
 * sheet that slides up over the player.
 */
export default function MobileAudioOptionsSheet({ radio, onClose }: Props) {
  const { t } = useTranslation();
  const playbackId = useId();
  const normalizationId = useId();

  return (
    <MobileSheet title={t('settings.tabAudio')} onClose={onClose} className="mobile-sheet--audio">
      {!radio && (
        <section className="mobile-audio-options__section" aria-labelledby={playbackId}>
          <h3 id={playbackId} className="mobile-source-section__title">{t('settings.transitionsTitle')}</h3>
          <TransitionModeChips layout="segmented" />
          <CrossfadeLengthSlider />
        </section>
      )}
      <section className="mobile-audio-options__section" aria-labelledby={normalizationId}>
        <h3 id={normalizationId} className="mobile-source-section__title">{t('settings.normalization')}</h3>
        <NormalizationEngineSwitch labelledBy={normalizationId} />
      </section>
    </MobileSheet>
  );
}
