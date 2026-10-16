import { useTranslation } from 'react-i18next';
import QueuePanel from '@/features/queue';
import { useOrbitStore } from '@/features/orbit';
import MobileSheet from '@/features/mobileShell/components/MobileSheet';

/**
 * The queue panel's touch layout in a full-height sheet: same actions as the
 * desktop panel (shuffle, playlist save/load, share, clear, transitions,
 * infinite queue, queue/playlist/timeline), and the Orbit guest queue.
 */
export default function MobileQueueSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  // The queue's touch header brings its own title and Close; the Orbit guest
  // queue has no such header, so for a guest the sheet keeps its title row.
  const guest = useOrbitStore(s => s.role === 'guest');
  return (
    <MobileSheet
      title={t('queue.title')}
      hideTitle={!guest}
      onClose={onClose}
      className={`mobile-sheet--tall mobile-sheet--queue${guest ? ' mobile-sheet--queue-guest' : ''}`}
    >
      <QueuePanel touch onClose={onClose} />
    </MobileSheet>
  );
}
