import { ChevronRight, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingsSegmented } from '@/features/settings/components/SettingsSegmented';
import {
  ANALYTICS_STRATEGIES,
  ADVANCED_PARALLELISM_MAX,
  ADVANCED_PARALLELISM_MIN,
  type AnalyticsStrategy,
} from '@/lib/library/analysisStrategy';

export interface AnalyticsTouchServerRow {
  serverId: string;
  /** Index key the progress and failed counts are stored under. */
  indexKey: string;
  label: string;
  strategy: AnalyticsStrategy;
  parallelism: number;
  progressText: string | null;
  failedCount: number;
  clearing: boolean;
}

interface Props {
  rows: AnalyticsTouchServerRow[];
  removedServerIds: string[];
  clearingServerId: string | null;
  strategyLabel: (s: AnalyticsStrategy) => string;
  onStrategy: (serverId: string, s: AnalyticsStrategy) => void;
  onParallelism: (serverId: string, n: number) => void;
  onOpenFailed: (row: AnalyticsTouchServerRow) => void;
  onClear: (serverId: string, label: string) => void;
}

/** "Analysis progress:" reads as a row label without its trailing colon. */
function rowLabel(text: string): string {
  return text.replace(/\s*[:：]\s*$/, '');
}

/**
 * Touch layout of the analytics strategies: one iOS-style group per server
 * (strategy, workers only for Aggressive, progress, failed tracks, a red
 * "Clear analysis" row) and the two strategy notes as a footnote, instead of
 * the desktop table stacked into blocks.
 */
export function AnalyticsStrategyTouchList({
  rows, removedServerIds, clearingServerId, strategyLabel,
  onStrategy, onParallelism, onOpenFailed, onClear,
}: Props) {
  const { t } = useTranslation();
  const options = ANALYTICS_STRATEGIES.map(s => ({ id: s, label: strategyLabel(s) }));

  return (
    <div className="analytics-touch">
      {rows.map(row => (
        <section key={row.serverId} className="analytics-touch__server" aria-label={row.label}>
          <h3 className="analytics-touch__name">{row.label}</h3>
          <div className="analytics-touch__group">
            <div className="analytics-touch__row analytics-touch__row--stack">
              <span className="analytics-touch__label">{t('settings.analyticsStrategyLabel')}</span>
              <SettingsSegmented
                options={options}
                value={row.strategy}
                onChange={s => onStrategy(row.serverId, s)}
                ariaLabel={`${t('settings.analyticsStrategyLabel')}: ${row.label}`}
              />
            </div>
            {row.strategy === 'advanced' && (
              <label className="analytics-touch__row">
                <span className="analytics-touch__label">{t('settings.analyticsStrategyParallelismLabel')}</span>
                <input
                  type="range"
                  className="analytics-touch__range"
                  min={ADVANCED_PARALLELISM_MIN}
                  max={ADVANCED_PARALLELISM_MAX}
                  step={1}
                  value={row.parallelism}
                  onChange={e => onParallelism(row.serverId, parseInt(e.target.value, 10))}
                />
                <span className="analytics-touch__value">{row.parallelism}</span>
              </label>
            )}
            <div className="analytics-touch__row">
              <span className="analytics-touch__label">{rowLabel(t('settings.analyticsStrategyProgressLabel'))}</span>
              <span className="analytics-touch__value">{row.progressText ?? '—'}</span>
            </div>
            {row.failedCount > 0 && (
              <button type="button" className="analytics-touch__row analytics-touch__row--button" onClick={() => onOpenFailed(row)}>
                <TriangleAlert size={16} aria-hidden="true" className="analytics-touch__warn" />
                <span className="analytics-touch__label">{t('settings.analyticsFailedTracksOpenTitle', { count: row.failedCount })}</span>
                <ChevronRight size={18} aria-hidden="true" className="analytics-touch__chevron" />
              </button>
            )}
            <button
              type="button"
              className="analytics-touch__row analytics-touch__row--button analytics-touch__row--danger"
              onClick={() => onClear(row.serverId, row.label)}
              disabled={row.clearing}
            >
              {t('settings.analyticsStrategyClearAction')}
            </button>
          </div>
        </section>
      ))}

      {removedServerIds.map(serverId => (
        <section key={serverId} className="analytics-touch__server" aria-label={serverId}>
          <h3 className="analytics-touch__name">
            {serverId}
            <span className="analytics-touch__removed">{t('settings.analyticsStrategyServerRemoved')}</span>
          </h3>
          <div className="analytics-touch__group">
            <button
              type="button"
              className="analytics-touch__row analytics-touch__row--button analytics-touch__row--danger"
              onClick={() => onClear(serverId, serverId)}
              disabled={clearingServerId === serverId}
            >
              {t('settings.analyticsStrategyClearAction')}
            </button>
          </div>
        </section>
      ))}

      <div className="analytics-touch__footnote">
        <p><strong>{t('settings.analyticsStrategyLazy')}</strong> {t('settings.analyticsStrategyLazyDesc')}</p>
        <p><strong>{t('settings.analyticsStrategyAdvanced')}</strong> {t('settings.analyticsStrategyAdvancedDesc')} {t('settings.analyticsStrategyAdvancedWarning')}</p>
      </div>
    </div>
  );
}
