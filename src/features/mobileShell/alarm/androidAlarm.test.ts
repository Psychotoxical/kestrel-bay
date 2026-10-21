import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/util/platform', async importOriginal => ({ ...(await importOriginal<object>()), IS_ANDROID: true }));
const car = vi.hoisted(() => ({ carPlayPlay: vi.fn(async () => {}) }));
vi.mock('@/features/mobileShell/car/carplayContent', () => car);

import { usePlayerStore } from '@/features/playback/store/playerStore';
import { resetAllStores } from '@/test/helpers/storeReset';
import { newAlarm, useAlarmStore } from './alarmStore';
import { dismissAlarm, installAndroidAlarm } from './androidAlarm';

describe('the music alarm bridge', () => {
  let host: Record<string, ReturnType<typeof vi.fn>>;
  let stop: () => void;

  beforeEach(() => {
    resetAllStores();
    useAlarmStore.setState({ alarms: [{ ...newAlarm('one'), days: [] }], ringing: null });
    car.carPlayPlay.mockClear();
    host = {
      setAlarms: vi.fn(),
      takeDisabled: vi.fn(() => '["one"]'),
      ready: vi.fn(),
      musicStarted: vi.fn(),
      dismiss: vi.fn(),
      status: vi.fn(() => '{}'),
      fix: vi.fn(),
    };
    window.PsysonicAndroidAlarm = host as never;
    stop = installAndroidAlarm();
  });
  afterEach(() => {
    stop();
    delete window.PsysonicAndroidAlarm;
  });

  it('turns off one-time alarms that rang natively, and hands every change over', () => {
    expect(useAlarmStore.getState().alarms[0].enabled).toBe(false);
    expect(JSON.parse(host.setAlarms.mock.lastCall![0] as string)[0]).toMatchObject({ id: 'one', enabled: false });
    useAlarmStore.getState().setEnabled('one', true);
    expect(JSON.parse(host.setAlarms.mock.lastCall![0] as string)[0].enabled).toBe(true);
    expect(host.ready).toHaveBeenCalledOnce();
  });

  it('a ringing alarm shows, starts its music and reports it once it plays', () => {
    vi.useFakeTimers();
    window.__psyAlarmRing!(JSON.stringify({ ...newAlarm('one'), source: { kind: 'random' } }));
    expect(useAlarmStore.getState().ringing?.id).toBe('one');
    // A page the alarm just opened waits for its own start-up first.
    vi.advanceTimersByTime(6000);
    expect(car.carPlayPlay).toHaveBeenCalledWith('random');
    vi.useRealTimers();
    expect(host.musicStarted).not.toHaveBeenCalled();
    usePlayerStore.setState({ isPlaying: true });
    expect(host.musicStarted).toHaveBeenCalledOnce();
  });

  it('snooze closes the ringing screen and tells the native side', () => {
    window.__psyAlarmRing!(JSON.stringify(newAlarm('one')));
    dismissAlarm(true);
    expect(useAlarmStore.getState().ringing).toBeNull();
    expect(host.dismiss).toHaveBeenCalledWith(true);
  });
});
