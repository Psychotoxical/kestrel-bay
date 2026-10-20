import { useEffect } from 'react';
import { emit, listen } from '@tauri-apps/api/event';
import { playSiriRequest, siriArtistVocabulary, type SiriPlayRequest } from '@/features/mobileShell/car/siriPlay';

/**
 * iOS Siri: the native side (`src-tauri/src/ios/siri.rs`) hands over what Siri understood
 * (`siri:play`); this plays it. Once listening it reports `siri:ready`, so a request that
 * arrived during a cold start is sent again. It also hands Siri the library's artist names
 * (`siri:vocabulary`) so it recognises them.
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
      void siriArtistVocabulary().then(names => {
        if (!cancelled && names.length > 0) void emit('siri:vocabulary', names);
      });
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
