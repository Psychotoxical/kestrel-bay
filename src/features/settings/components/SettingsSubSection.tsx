import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';
import { IS_MOBILE_SHELL } from '@/lib/util/platform';

interface SettingsSubSectionProps {
  title: string;
  /** Heading shown in the touch shell when the desktop name does not fit there (search keeps `title`). */
  touchTitle?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  description?: string;
  searchText?: string;
  // Rechts im Summary neben dem Chevron (z.B. Reset-Button). Clicks werden
  // gestoppt, damit sie das Accordion nicht togglen.
  action?: React.ReactNode;
  /** Hidden unless the global Advanced Mode toggle is on; renders a small badge when visible. */
  advanced?: boolean;
  children: React.ReactNode;
}

// Wird innerhalb eines Settings-Tabs als Accordion-Gruppe genutzt. Natives
// <details> liefert Keyboard + ARIA gratis; der CSS-Stil setzt den Chevron
// im Summary mittels [open]-Selektor.
export default function SettingsSubSection({
  title,
  touchTitle,
  icon,
  defaultOpen = false,
  description,
  searchText,
  action,
  advanced = false,
  children,
}: SettingsSubSectionProps) {
  const { t } = useTranslation();
  const advancedSettingsEnabled = useAuthStore(s => s.advancedSettingsEnabled);
  const headingId = useId();

  if (advanced && !advancedSettingsEnabled) return null;

  // Touch shell: a settings page is one category already, so its sections are
  // plain headed groups (iOS style) instead of accordions to tap open one by one.
  if (IS_MOBILE_SHELL) {
    return (
      <section
        className="settings-sub-section settings-sub-section--touch"
        data-settings-search={searchText ?? title}
        data-advanced={advanced ? 'true' : undefined}
        aria-labelledby={headingId}
      >
        <div className="settings-sub-section-summary">
          <h2 id={headingId} className="settings-sub-section-title">{touchTitle ?? title}</h2>
          {advanced && (
            <span className="settings-sub-section-advanced-badge" aria-hidden="true">
              {t('settings.advancedBadge')}
            </span>
          )}
          {action && <span className="settings-sub-section-action">{action}</span>}
        </div>
        {description && (
          <p className="settings-sub-section-desc">{description}</p>
        )}
        <div className="settings-sub-section-content">
          {children}
        </div>
      </section>
    );
  }

  return (
    <details
      className="settings-sub-section"
      data-settings-search={searchText ?? title}
      data-advanced={advanced ? 'true' : undefined}
      open={defaultOpen}
    >
      <summary
        className="settings-sub-section-summary"
        aria-labelledby={headingId}
      >
        {icon && <span className="settings-sub-section-icon">{icon}</span>}
        <span id={headingId} className="settings-sub-section-title">{title}</span>
        {advanced && (
          <span className="settings-sub-section-advanced-badge" aria-hidden="true">
            {t('settings.advancedBadge')}
          </span>
        )}
        {action && (
          <span
            className="settings-sub-section-action"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
          >
            {action}
          </span>
        )}
        <ChevronDown size={16} className="settings-sub-section-chevron" aria-hidden="true" />
      </summary>
      {description && (
        <p className="settings-sub-section-desc">{description}</p>
      )}
      <div className="settings-sub-section-content">
        {children}
      </div>
    </details>
  );
}
