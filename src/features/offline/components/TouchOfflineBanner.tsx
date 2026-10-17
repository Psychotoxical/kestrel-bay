import type { ComponentProps } from 'react';
import OfflineBanner from '@/features/offline/components/OfflineBanner';
import { useDevOfflineBrowseStore } from '@/store/devOfflineBrowseStore';

/**
 * Touch shell: the offline banner, left out while "downloaded music only" is
 * on — the Mainstage chip says so already, and its Retry could not reconnect.
 */
export default function TouchOfflineBanner(props: ComponentProps<typeof OfflineBanner>) {
  const downloadsOnly = useDevOfflineBrowseStore(s => s.forceOffline);
  if (downloadsOnly) return null;
  return <OfflineBanner {...props} />;
}
