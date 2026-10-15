import { useTranslation } from 'react-i18next';
import QueuePanel from '@/features/queue';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';

/**
 * The queue panel's touch layout in a full-height sheet: same actions as the
 * desktop panel (shuffle, playlist save/load, share, clear, transitions,
 * infinite queue, queue/playlist/timeline), and the Orbit guest queue.
 */
export default function MobileQueueSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <MobileSheet title={t('queue.title')} hideTitle onClose={onClose} className="mobile-sheet--tall mobile-sheet--queue">
      <QueuePanel touch onClose={onClose} />
    </MobileSheet>
  );
}
