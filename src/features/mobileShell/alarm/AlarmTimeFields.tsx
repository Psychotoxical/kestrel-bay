import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pad2 } from './alarmFormat';

interface Props {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}

/** Digits only, at most two. */
const digits = (value: string) => value.replace(/\D/g, '').slice(0, 2);

/**
 * The alarm time as two big number fields (Frank 21.10.): a tap on the hours or the minutes
 * opens the number keyboard; two digits in the hours move on to the minutes. Out-of-range
 * values are clamped when a field is left.
 */
export default function AlarmTimeFields({ hour, minute, onChange }: Props) {
  const { t } = useTranslation();
  const minuteRef = useRef<HTMLInputElement>(null);
  // What the user is typing; null shows the stored value, padded.
  const [hourText, setHourText] = useState<string | null>(null);
  const [minuteText, setMinuteText] = useState<string | null>(null);

  const commitHour = (text: string) => {
    const value = Number(text);
    if (text !== '' && Number.isFinite(value)) onChange(Math.min(23, value), minute);
    setHourText(null);
  };
  const commitMinute = (text: string) => {
    const value = Number(text);
    if (text !== '' && Number.isFinite(value)) onChange(hour, Math.min(59, value));
    setMinuteText(null);
  };

  return (
    <div className="alarm-time" role="group" aria-label={t('alarm.time')}>
      <input
        className="alarm-time__field"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        aria-label={t('alarm.hours')}
        value={hourText ?? pad2(hour)}
        onFocus={e => { setHourText(pad2(hour)); e.currentTarget.select(); }}
        onChange={e => {
          const text = digits(e.target.value);
          setHourText(text);
          if (text.length === 2) {
            commitHour(text);
            minuteRef.current?.focus();
          }
        }}
        onBlur={e => { if (hourText !== null) commitHour(digits(e.target.value)); }}
      />
      <span className="alarm-time__colon" aria-hidden="true">:</span>
      <input
        ref={minuteRef}
        className="alarm-time__field"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        aria-label={t('alarm.minutes')}
        value={minuteText ?? pad2(minute)}
        onFocus={e => { setMinuteText(pad2(minute)); e.currentTarget.select(); }}
        onChange={e => setMinuteText(digits(e.target.value))}
        onBlur={e => { if (minuteText !== null) commitMinute(digits(e.target.value)); }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      />
    </div>
  );
}
