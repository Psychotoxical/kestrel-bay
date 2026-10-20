import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * Full-screen theme preview for the touch shell. Theme screenshots are wide desktop shots and
 * the app stays upright, so a wide shot is turned on its side to fill the screen; turning the
 * phone then shows it the right way up. A tap anywhere closes it.
 */
export default function MobileThemePreview({ src, alt, onClose }: Props) {
  const { t } = useTranslation();
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="mobile-theme-preview" onClick={onClose} role="dialog" aria-modal="true" aria-label={alt}>
      <img
        className={`mobile-theme-preview__img${wide ? ' mobile-theme-preview__img--turned' : ''}`}
        src={src}
        alt={alt}
        onLoad={e => {
          const img = e.currentTarget;
          setWide(img.naturalWidth > img.naturalHeight && window.innerHeight > window.innerWidth);
        }}
      />
      <button type="button" className="mobile-theme-preview__close" onClick={e => { e.stopPropagation(); onClose(); }} aria-label={t('common.close')}>
        <X size={22} />
      </button>
    </div>,
    document.body,
  );
}
