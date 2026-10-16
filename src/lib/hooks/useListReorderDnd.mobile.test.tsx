import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { dispatchTouch } from '@/test/helpers/touch';
import { LIFT_MS } from '@/lib/dnd/useTouchListReorder';
import { useListReorderDnd } from '@/lib/hooks/useListReorderDnd';
import type { ListReorderDropTarget } from '@/lib/util/listReorder';

const ROW_H = 44;
const IDS = ['mainstage', 'albums', 'artists', 'genres'];

function Customizer({ apply }: { apply: (id: string, target: ListReorderDropTarget) => void }) {
  const { setContainer, onMouseMove, dropEdge } = useListReorderDnd({ type: 'test_reorder', apply });
  return (
    <div ref={setContainer} onMouseMove={onMouseMove}>
      {IDS.map(id => (
        <div key={id} data-reorder-id={id} data-reorder-section="library" data-testid={id} data-drop={dropEdge(id) ?? ''}>
          {id}
          <label className="toggle-switch"><input type="checkbox" aria-label={`show ${id}`} /></label>
        </div>
      ))}
    </div>
  );
}

const at = (y: number) => ({ x: 100, y });

describe('useListReorderDnd (touch shell)', () => {
  let layout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    layout = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const idx = IDS.indexOf(this.dataset.reorderId ?? '');
      if (idx >= 0) return new DOMRect(0, idx * ROW_H, 400, ROW_H);
      return new DOMRect(0, -1000, 400, 3000);
    });
  });

  afterEach(() => {
    layout.mockRestore();
    vi.useRealTimers();
  });

  it('a held row can be dragged to a new place; the customizer gets the row ids and section', () => {
    const apply = vi.fn();
    render(<Customizer apply={apply} />);
    act(() => { dispatchTouch(screen.getByTestId('artists'), 'touchstart', at(110)); });
    act(() => { vi.advanceTimersByTime(LIFT_MS); });
    act(() => { dispatchTouch(screen.getByTestId('artists'), 'touchmove', at(60)); });
    act(() => { dispatchTouch(screen.getByTestId('artists'), 'touchmove', at(10)); });
    expect(screen.getByTestId('mainstage')).toHaveAttribute('data-drop', 'before');

    act(() => { dispatchTouch(screen.getByTestId('artists'), 'touchend', at(10)); });
    expect(apply).toHaveBeenCalledWith('artists', { id: 'mainstage', before: true, section: 'library' });
  });

  it('the row\'s switch keeps its tap', () => {
    const apply = vi.fn();
    render(<Customizer apply={apply} />);
    act(() => { dispatchTouch(screen.getByLabelText('show albums'), 'touchstart', at(60)); });
    act(() => { vi.advanceTimersByTime(LIFT_MS); });
    expect(screen.getByTestId('albums')).not.toHaveClass('is-reorder-lifted');
  });
});
