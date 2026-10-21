import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlarmClock, Music } from 'lucide-react';
import { usePlayerStore } from '@/features/playback';
import { usePlaybackCoverArt } from '@/cover/usePlaybackCoverArt';
import { usePlaybackTrackCoverRef } from '@/cover/useLibraryCoverRef';
import { useCachedUrl } from '@/ui/CachedImage';
import { useAlarmStore } from './alarmStore';
import { pad2 } from './alarmFormat';
import { dismissAlarm } from './androidAlarm';

/**
 * ⚠️ Android territory. The ringing alarm over everything, also over the lock screen
 * (PsysonicAlarm opens the activity there): the time, what plays, and two big buttons,
 * Snooze and Stop (Frank 21.10.). Stop has to be held for two seconds, so a sleepy thumb
 * aiming at Snooze cannot end the alarm (Asra, 21.10.).
 */
const HOLD_MS = 2000;

export default function AlarmRingingScreen() {
  const { t, i18n } = useTranslation();
  const ringing = useAlarmStore(s => s.ringing);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const coverRef = usePlaybackTrackCoverRef(currentTrack ?? undefined);
  const { src, cacheKey } = usePlaybackCoverArt(coverRef, 512);
  const resolvedCover = useCachedUrl(src, cacheKey);
  const cover = currentTrack?.directCoverArtUrl ?? resolvedCover;
  const [now, setNow] = useState(() => new Date());
  const [holding, setHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startHold = () => {
    clearTimeout(holdTimer.current);
    setHolding(true);
    holdTimer.current = setTimeout(() => { setHolding(false); dismissAlarm(false); }, HOLD_MS);
  };
  const cancelHold = () => {
    clearTimeout(holdTimer.current);
    setHolding(false);
  };
  useEffect(() => () => clearTimeout(holdTimer.current), []);

  useEffect(() => {
    if (!ringing) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [ringing]);

  if (!ringing) return null;
  const date = new Intl.DateTimeFormat(i18n.language, { weekday: 'long', day: 'numeric', month: 'long' }).format(now);

  return createPortal(
    <div className="alarm-ringing" role="alertdialog" aria-modal="true" aria-label={ringing.label || t('alarm.title')}>
      <div className="alarm-ringing__top">
        <AlarmClock size={22} aria-hidden="true" />
        <span>{ringing.label || t('alarm.title')}</span>
      </div>
      <div className="alarm-ringing__time">{pad2(now.getHours())}:{pad2(now.getMinutes())}</div>
      <div className="alarm-ringing__date">{date}</div>
      <div className="alarm-ringing__cover">
        {cover ? <img src={cover} alt="" /> : <Music size={64} aria-hidden="true" />}
      </div>
      {currentTrack && (
        <div className="alarm-ringing__track">
          <span className="alarm-ringing__title">{currentTrack.title}</span>
          <span className="alarm-ringing__artist">{currentTrack.artist}</span>
        </div>
      )}
      <div className="alarm-ringing__actions">
        <button type="button" className="alarm-ringing__btn" onClick={() => dismissAlarm(true)}>
          <span>{t('alarm.snooze')}</span>
          <small>{t('alarm.snoozeMinutes', { count: ringing.snoozeMin })}</small>
        </button>
        <button
          type="button"
          className={`alarm-ringing__btn alarm-ringing__btn--stop${holding ? ' is-holding' : ''}`}
          onPointerDown={startHold}
          onPointerUp={cancelHold}
          onPointerLeave={cancelHold}
          onPointerCancel={cancelHold}
          onContextMenu={e => e.preventDefault()}
          onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) startHold(); }}
          onKeyUp={cancelHold}
        >
          <svg className="alarm-ringing__hold" viewBox="0 0 36 36" aria-hidden="true">
            <circle cx="18" cy="18" r="15" pathLength="100" />
          </svg>
          <span>{t('alarm.stop')}</span>
          <small>{t('alarm.holdToStop')}</small>
        </button>
      </div>
    </div>,
    document.body,
  );
}
