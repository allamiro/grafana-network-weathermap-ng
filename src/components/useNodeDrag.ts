import { RefObject, useEffect, useLayoutEffect, useRef } from 'react';

/** Movement since the previous drag event, in client pixels. */
export interface DragDelta {
  deltaX: number;
  deltaY: number;
}

export type DragHandler = (e: MouseEvent | TouchEvent, delta: DragDelta) => void;

interface Options {
  /** The element that starts the drag; touchstart is bound to it directly. */
  ref: RefObject<Element | null>;
  disabled?: boolean;
  onDrag: DragHandler;
  onStop: DragHandler;
}

type Point = { x: number; y: number };

/** The finger that started a touch drag, in a TouchList, or undefined. */
const findTouch = (list: TouchList, id: number): Touch | undefined => Array.from(list).find((t) => t.identifier === id);

/**
 * Pointer dragging for a map node, replacing react-draggable's DraggableCore
 * (which the Grafana plugin validator flags for React 19 because it assigns
 * propTypes/defaultProps). Same contract the panel relied on:
 *
 * - a drag starts on a primary-button mousedown or a touchstart, unless disabled;
 * - every move reports the delta since the last event (DraggableCore's
 *   deltaX/deltaY at scale 1), with the native event so Ctrl/⌘ can be read;
 * - a touch drag follows only the finger that started it: other fingers
 *   neither move the node nor end the drag, and a second touch on the node
 *   doesn't restart it (DraggableCore tracked the touch identifier too);
 * - release calls onStop, even when the pointer didn't move;
 * - text selection is suppressed while dragging, and touch drags don't scroll;
 * - no findDOMNode, so nothing here was removed in React 19.
 *
 * Spread the returned props onto the element in `ref`.
 */
export function useNodeDrag({ ref, disabled, onDrag, onStop }: Options) {
  // Latest handlers without re-binding listeners mid-drag. Refs are updated in
  // a layout effect, not during render, so React can render this safely.
  const handlers = useRef({ onDrag, onStop });
  useLayoutEffect(() => {
    handlers.current = { onDrag, onStop };
  });
  const cleanup = useRef<(() => void) | null>(null);

  // A node unmounted mid-drag must not leave document listeners behind.
  useEffect(() => () => cleanup.current?.(), []);

  const start = (native: MouseEvent | TouchEvent) => {
    // Disabled, or a drag is already running (e.g. a second finger landed on
    // the node): keep the current drag rather than restarting from a new point.
    if (disabled || cleanup.current) {
      return;
    }
    if (!('touches' in native) && native.button !== 0) {
      return;
    }
    // A touch drag belongs to the finger that started it: the one that just
    // touched this node, not touches[0], which may be a finger elsewhere.
    const touchId = 'touches' in native ? native.changedTouches[0]?.identifier : undefined;
    if ('touches' in native && touchId === undefined) {
      return;
    }
    const pointOf = (e: MouseEvent | TouchEvent, list: 'changedTouches'): Point | null => {
      if (!('touches' in e)) {
        return { x: e.clientX, y: e.clientY };
      }
      const t = findTouch(e[list], touchId!);
      return t ? { x: t.clientX, y: t.clientY } : null;
    };
    let last = pointOf(native, 'changedTouches');
    if (!last) {
      return;
    }
    if ('touches' in native) {
      // Stop the page scrolling under a touch drag, as DraggableCore did.
      native.preventDefault();
    }

    const doc = (native.target as Node | null)?.ownerDocument ?? document;
    const body = doc.body;
    const previousUserSelect = body.style.userSelect;
    body.style.userSelect = 'none';

    const move = (e: MouseEvent | TouchEvent) => {
      // Only the dragging finger moves the node, and only when it moved:
      // changedTouches lists the fingers that changed in this event.
      const p = pointOf(e, 'changedTouches');
      if (!p || !last) {
        return;
      }
      if ('touches' in e) {
        e.preventDefault();
      }
      const delta = { deltaX: p.x - last.x, deltaY: p.y - last.y };
      last = p;
      handlers.current.onDrag(e, delta);
    };
    const end = (e: MouseEvent | TouchEvent) => {
      // Another finger lifting doesn't end (and commit) this drag.
      if ('touches' in e && !findTouch(e.changedTouches, touchId!)) {
        return;
      }
      remove();
      handlers.current.onStop(e, { deltaX: 0, deltaY: 0 });
    };
    const remove = () => {
      doc.removeEventListener('mousemove', move);
      doc.removeEventListener('mouseup', end);
      doc.removeEventListener('touchmove', move);
      doc.removeEventListener('touchend', end);
      doc.removeEventListener('touchcancel', end);
      body.style.userSelect = previousUserSelect;
      cleanup.current = null;
    };
    doc.addEventListener('mousemove', move);
    doc.addEventListener('mouseup', end);
    doc.addEventListener('touchmove', move, { passive: false });
    doc.addEventListener('touchend', end);
    doc.addEventListener('touchcancel', end);
    cleanup.current = remove;
  };

  // React registers touch listeners as passive, where preventDefault is
  // ignored, so touchstart is bound natively with passive: false (as
  // DraggableCore did) to stop the page scrolling under a touch drag.
  const startRef = useRef(start);
  useLayoutEffect(() => {
    startRef.current = start;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const onTouchStart = (e: Event) => startRef.current(e as TouchEvent);
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    return () => el.removeEventListener('touchstart', onTouchStart);
  }, [ref]);

  return {
    onMouseDown: (e: React.MouseEvent) => start(e.nativeEvent),
  };
}
