/**
 * Touch gestures for jsdom (no `Touch` constructor): a plain `Event` carrying
 * `touches` / `changedTouches`, which both native listeners and React's
 * synthetic touch events read.
 */
export interface Point {
  x: number;
  y: number;
}

type TouchType = 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel';

export function dispatchTouch(target: EventTarget, type: TouchType, point: Point): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const touch = { clientX: point.x, clientY: point.y, identifier: 0, target };
  const active = type === 'touchend' || type === 'touchcancel' ? [] : [touch];
  Object.defineProperty(event, 'touches', { value: active });
  Object.defineProperty(event, 'targetTouches', { value: active });
  Object.defineProperty(event, 'changedTouches', { value: [touch] });
  target.dispatchEvent(event);
  return event;
}

/** Finger down at `from`, `steps` moves to `to`, finger up. Returns the move events. */
export function swipe(target: EventTarget, from: Point, to: Point, steps = 8): Event[] {
  dispatchTouch(target, 'touchstart', from);
  const moves: Event[] = [];
  for (let i = 1; i <= steps; i++) {
    moves.push(dispatchTouch(target, 'touchmove', {
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    }));
  }
  dispatchTouch(target, 'touchend', to);
  return moves;
}
