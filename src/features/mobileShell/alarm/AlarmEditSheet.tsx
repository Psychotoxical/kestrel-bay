import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';
import { usePlaylistStore } from '@/features/playlist/store/playlistStore';
import { useLuckyMixAvailable } from '@/features/randomMix';
import { FADE_CHOICES, SNOOZE_CHOICES, type Alarm, type AlarmSource } from './alarmStore';
import { weekdayNames } from './alarmFormat';
import AlarmTimeFields from './AlarmTimeFields';

interface Props {
  alarm: Alarm;
  isNew: boolean;
  onSave: (alarm: Alarm) => void;
  onDelete: () => void;
  onClose: () => void;
}

type SourceKind = AlarmSource['kind'];

/** Time, repeat days, music and how it rings, in one sheet (Frank 21.10.: big time cards). */
export default function AlarmEditSheet({ alarm, isNew, onSave, onDelete, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [draft, setDraft] = useState<Alarm>(alarm);
  const playlists = usePlaylistStore(s => s.playlists);
  const luckyAvailable = useLuckyMixAvailable();
  const ids = { repeat: useId(), music: useId(), snooze: useId(), fade: useId(), volume: useId() };
  const update = (patch: Partial<Alarm>) => setDraft(d => ({ ...d, ...patch }));
  const days = weekdayNames(i18n.language);

  const kinds: SourceKind[] = [...(luckyAvailable ? ['luckymix' as const] : []), 'random', 'favorites', 'playlist'];
  const kindLabel: Record<SourceKind, string> = {
    luckymix: t('alarm.sourceLuckymix'),
    random: t('alarm.sourceRandom'),
    favorites: t('alarm.sourceFavorites'),
    playlist: t('alarm.sourcePlaylist'),
  };
  const setKind = (kind: SourceKind) => {
    if (kind === 'playlist') {
      const first = playlists[0];
      update({ source: { kind, id: first?.id ?? '', serverId: first?.serverId, name: first?.name ?? '' } });
    } else {
      update({ source: { kind } });
    }
  };
  const playlistMissing = draft.source.kind === 'playlist' && !draft.source.id;

  return (
    <MobileSheet title={t(isNew ? 'alarm.add' : 'alarm.edit')} onClose={onClose} className="mobile-sheet--alarm">
      <div className="alarm-edit">
        <AlarmTimeFields hour={draft.hour} minute={draft.minute} onChange={(hour, minute) => update({ hour, minute })} />

        <section className="alarm-edit__section" aria-labelledby={ids.repeat}>
          <h3 id={ids.repeat} className="mobile-source-section__title">{t('alarm.repeat')}</h3>
          <div className="alarm-days" role="group" aria-labelledby={ids.repeat}>
            {days.map((name, i) => {
              const day = i + 1;
              const on = draft.days.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  className={`alarm-day${on ? ' is-active' : ''}`}
                  aria-pressed={on}
                  aria-label={weekdayNames(i18n.language, 'short')[i]}
                  onClick={() => update({ days: on ? draft.days.filter(d => d !== day) : [...draft.days, day].sort() })}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </section>

        <section className="alarm-edit__section" aria-labelledby={ids.music}>
          <h3 id={ids.music} className="mobile-source-section__title">{t('alarm.music')}</h3>
          <div className="mobile-chips mobile-chips--wrap" role="group" aria-labelledby={ids.music}>
            {kinds.map(kind => (
              <button
                key={kind}
                type="button"
                className={`mobile-chip${draft.source.kind === kind ? ' is-active' : ''}`}
                aria-pressed={draft.source.kind === kind}
                onClick={() => setKind(kind)}
              >
                {kindLabel[kind]}
              </button>
            ))}
          </div>
          {draft.source.kind === 'playlist' && (
            <>
              <select
                className="alarm-edit__select"
                aria-label={t('alarm.choosePlaylist')}
                value={draft.source.id}
                onChange={e => {
                  const pick = playlists.find(p => p.id === e.target.value);
                  if (pick) update({ source: { kind: 'playlist', id: pick.id, serverId: pick.serverId, name: pick.name } });
                }}
              >
                {!draft.source.id && <option value="">{t('alarm.choosePlaylist')}</option>}
                {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ToggleRow label={t('alarm.shuffle')} checked={draft.shuffle} onChange={shuffle => update({ shuffle })} />
            </>
          )}
          <p className="alarm-edit__hint">{t('alarm.offlineHint')}</p>
        </section>

        <section className="alarm-edit__section" aria-labelledby={ids.snooze}>
          <h3 id={ids.snooze} className="mobile-source-section__title">{t('alarm.snooze')}</h3>
          <div className="mobile-segmented" role="group" aria-labelledby={ids.snooze}>
            {SNOOZE_CHOICES.map(min => (
              <button
                key={min}
                type="button"
                className={`mobile-segmented__item${draft.snoozeMin === min ? ' is-active' : ''}`}
                aria-pressed={draft.snoozeMin === min}
                onClick={() => update({ snoozeMin: min })}
              >
                {t('alarm.snoozeMinutes', { count: min })}
              </button>
            ))}
          </div>
        </section>

        <section className="alarm-edit__section" aria-labelledby={ids.fade}>
          <h3 id={ids.fade} className="mobile-source-section__title">{t('alarm.fadeIn')}</h3>
          <div className="mobile-segmented" role="group" aria-labelledby={ids.fade}>
            {FADE_CHOICES.map(secs => (
              <button
                key={secs}
                type="button"
                className={`mobile-segmented__item${draft.fadeSecs === secs ? ' is-active' : ''}`}
                aria-pressed={draft.fadeSecs === secs}
                onClick={() => update({ fadeSecs: secs })}
              >
                {secs === 0 ? t('alarm.fadeOff') : secs < 60 ? t('alarm.fadeSeconds', { count: secs }) : t('alarm.fadeMinutes', { count: secs / 60 })}
              </button>
            ))}
          </div>
          <label className="mobile-crossfade-length" htmlFor={ids.volume}>
            <span className="mobile-crossfade-length__label">{t('alarm.maxVolume')}</span>
            <input
              id={ids.volume}
              type="range"
              min={5}
              max={100}
              step={5}
              value={draft.maxVolume}
              onChange={e => update({ maxVolume: Number(e.target.value) })}
            />
            <span className="mobile-crossfade-length__value">{draft.maxVolume} %</span>
          </label>
          <ToggleRow label={t('alarm.vibrate')} checked={draft.vibrate} onChange={vibrate => update({ vibrate })} />
        </section>

        <label className="alarm-edit__label">
          <span className="mobile-source-section__title">{t('alarm.label')}</span>
          <input
            type="text"
            maxLength={60}
            value={draft.label}
            placeholder={t('alarm.labelPlaceholder')}
            onChange={e => update({ label: e.target.value })}
          />
        </label>

        <div className="alarm-edit__actions">
          {!isNew && (
            <button type="button" className="btn btn-ghost alarm-edit__delete" onClick={onDelete}>
              {t('alarm.delete')}
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={playlistMissing}
            onClick={() => onSave({ ...draft, enabled: true })}
          >
            {t('alarm.save')}
          </button>
        </div>
      </div>
    </MobileSheet>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="settings-toggle-row alarm-edit__toggle">
      <span>{label}</span>
      <label className="toggle-switch" aria-label={label}>
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
        <span className="toggle-track" />
      </label>
    </div>
  );
}
