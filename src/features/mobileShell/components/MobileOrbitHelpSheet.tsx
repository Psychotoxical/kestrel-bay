import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles, Users, Share2, LogIn, MousePointerClick,
  ListMusic, Inbox, Sliders, LogOut,
} from 'lucide-react';
import { useHelpModalStore } from '@/features/orbit';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';

interface HelpSection {
  icon: ReactNode;
  titleKey: string;
  /** Where the desktop text speaks of clicks, Ctrl+V or the session bar, the touch shell has its own. */
  bodyKey: string;
  hostOnly?: boolean;
}

const SECTIONS: ReadonlyArray<HelpSection> = [
  { icon: <Sparkles size={18} />, titleKey: 'orbit.helpSec1Title', bodyKey: 'orbit.helpSec1Body' },
  { icon: <Users size={18} />, titleKey: 'orbit.helpSec2Title', bodyKey: 'orbit.helpSec2Body' },
  { icon: <Share2 size={18} />, titleKey: 'orbit.helpSec3Title', bodyKey: 'orbit.helpSec3BodyTouch' },
  { icon: <LogIn size={18} />, titleKey: 'orbit.helpSec4Title', bodyKey: 'orbit.helpSec4BodyTouch' },
  { icon: <MousePointerClick size={18} />, titleKey: 'orbit.helpSec5Title', bodyKey: 'orbit.helpSec5BodyTouch' },
  { icon: <ListMusic size={18} />, titleKey: 'orbit.helpSec6Title', bodyKey: 'orbit.helpSec6BodyTouch' },
  { icon: <Inbox size={18} />, titleKey: 'orbit.helpSec7Title', bodyKey: 'orbit.helpSec7Body', hostOnly: true },
  { icon: <Sliders size={18} />, titleKey: 'orbit.helpSec8Title', bodyKey: 'orbit.helpSec8BodyTouch', hostOnly: true },
  { icon: <LogOut size={18} />, titleKey: 'orbit.helpSec9Title', bodyKey: 'orbit.helpSec9BodyTouch' },
];

/**
 * Touch layout of the Orbit help: a tall sheet with every section open (a
 * phone reads top to bottom; the desktop modal's accordion and arrow-key
 * navigation have no use here) and touch wording where the desktop text
 * talks about clicks, Ctrl+V or the session bar. Opened through the same
 * `useHelpModalStore` as the desktop modal.
 */
export default function MobileOrbitHelpSheet() {
  const { t } = useTranslation();
  const { isOpen, close } = useHelpModalStore();
  if (!isOpen) return null;
  const hostOnlyLabel = t('orbit.helpHostOnly');

  return (
    <MobileSheet title={t('orbit.helpTitle')} onClose={close} className="mobile-sheet--tall mobile-sheet--orbit-help">
      <p className="mobile-orbit-help__intro">{t('orbit.helpIntro')}</p>
      {SECTIONS.map(({ icon, titleKey, bodyKey, hostOnly }) => (
        <section key={titleKey} className="mobile-orbit-help__section">
          <h3 className="mobile-orbit-help__title">
            <span className="mobile-orbit-help__icon" aria-hidden="true">{icon}</span>
            {hostOnly ? `${t(titleKey)} ${hostOnlyLabel}` : t(titleKey)}
          </h3>
          <p className="mobile-orbit-help__body">{t(bodyKey)}</p>
          {titleKey === 'orbit.helpSec2Title' && (
            <div className="mobile-orbit-help__warn">
              <strong>{t('orbit.helpSec2WarnHead')}</strong>
              <span>{t('orbit.helpSec2WarnBody')}</span>
            </div>
          )}
        </section>
      ))}
    </MobileSheet>
  );
}
