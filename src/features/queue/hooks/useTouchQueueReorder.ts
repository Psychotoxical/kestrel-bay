import type { RefObject } from 'react';
import { useTouchListReorder, type TouchDropTarget } from '@/lib/dnd/useTouchListReorder';

export { LIFT_MS, type TouchDropTarget } from '@/lib/dnd/useTouchListReorder';

interface Args {
  /** The queue list's scroll viewport. */
  listRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  /** Same contract as the desktop drop: indices to move and the gap to insert them at. */
  moveQueueItems: (indices: readonly number[], gapIndex: number) => void;
}

/**
 * Touch reordering for the queue sheet (hold a row, drag it, let go; see
 * `useTouchListReorder`). Timeline history rows stay where they are, and the
 * row's own buttons (favorite) keep their tap.
 */
export function useTouchQueueReorder({ listRef, enabled, moveQueueItems }: Args): TouchDropTarget | null {
  return useTouchListReorder({
    listRef,
    enabled,
    rowSelector: '[data-queue-idx]:not([data-timeline-kind="history"])',
    indexAttr: 'data-queue-idx',
    ignoreSelector: 'button',
    liftedClass: 'queue-item--lifted',
    onDrop: (from, target) => moveQueueItems([from], target.before ? target.idx : target.idx + 1),
  });
}
