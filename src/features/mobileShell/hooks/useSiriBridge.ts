import { useEffect } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { playSiriRequest, type SiriPlayRequest } from '@/features/mobileShell/utils/siriPlay';

/**
 * iOS Siri: the native side (`ios_siri.rs`) hands over what Siri understood
 * (`siri:play`); this plays it. Once listening it reports `siri:ready`, so a request that
 * arrived during a cold start is sent again.
 */
export function useSiriBridge(): void {
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    void listen<SiriPlayRequest>('siri:play', ({ payload }) => {
      void playSiriRequest(payload).catch(() => {});
    }).then(off => {
      if (cancelled) { off(); return; }
      unlisten = off;
      void emit('siri:ready');
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
