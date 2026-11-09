// useNodeDrag replaces react-draggable's DraggableCore for node dragging. These
// pin the contract the panel's node handlers depend on, so the drag behaviour
// can't drift from what DraggableCore did.
import React, { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DragHandler, useNodeDrag } from './useNodeDrag';

const Node = ({ onDrag, onStop, disabled }: { onDrag: DragHandler; onStop: DragHandler; disabled?: boolean }) => {
  const ref = useRef<SVGGElement>(null);
  const drag = useNodeDrag({ ref, disabled, onDrag, onStop });
  return (
    <svg>
      <g ref={ref} data-testid="node" onMouseDown={drag.onMouseDown}>
        <rect width={10} height={10} />
      </g>
    </svg>
  );
};

const setup = (disabled?: boolean) => {
  const onDrag = jest.fn<void, Parameters<DragHandler>>();
  const onStop = jest.fn<void, Parameters<DragHandler>>();
  const utils = render(<Node onDrag={onDrag} onStop={onStop} disabled={disabled} />);
  return { onDrag, onStop, node: screen.getByTestId('node'), ...utils };
};

const deltas = (fn: jest.Mock) => fn.mock.calls.map(([, d]) => [d.deltaX, d.deltaY]);

describe('useNodeDrag', () => {
  test('reports the movement since the previous event on every move', () => {
    const { onDrag, node } = setup();
    fireEvent.mouseDown(node, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseMove(document, { clientX: 110, clientY: 95 });
    fireEvent.mouseMove(document, { clientX: 140, clientY: 130 });
    expect(deltas(onDrag)).toEqual([
      [10, -5],
      [30, 35],
    ]);
  });

  test('passes the native event, so Ctrl/⌘ can switch to panning', () => {
    const { onDrag, node } = setup();
    fireEvent.mouseDown(node, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseMove(document, { clientX: 5, clientY: 5, ctrlKey: true });
    expect(onDrag.mock.calls[0][0].ctrlKey).toBe(true);
  });

  test('calls onStop on release, even without movement, then stops listening', () => {
    const { onDrag, onStop, node } = setup();
    fireEvent.mouseDown(node, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseUp(document, { clientX: 0, clientY: 0 });
    expect(onStop).toHaveBeenCalledTimes(1);

    fireEvent.mouseMove(document, { clientX: 50, clientY: 50 });
    fireEvent.mouseUp(document);
    expect(onDrag).not.toHaveBeenCalled();
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test('only the primary mouse button starts a drag', () => {
    const { onDrag, onStop, node } = setup();
    fireEvent.mouseDown(node, { clientX: 0, clientY: 0, button: 2 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(document);
    expect(onDrag).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });

  test('does nothing while disabled (view mode)', () => {
    const { onDrag, onStop, node } = setup(true);
    fireEvent.mouseDown(node, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseMove(document, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(document);
    fireEvent.touchStart(node, {
      touches: [{ identifier: 0, clientX: 0, clientY: 0 }],
      changedTouches: [{ identifier: 0, clientX: 0, clientY: 0 }],
    });
    expect(onDrag).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
  });

  test('blocks text selection during the drag and restores it afterwards', () => {
    document.body.style.userSelect = 'text';
    const { node } = setup();
    fireEvent.mouseDown(node, { clientX: 0, clientY: 0, button: 0 });
    expect(document.body.style.userSelect).toBe('none');
    fireEvent.mouseUp(document);
    expect(document.body.style.userSelect).toBe('text');
    document.body.style.userSelect = '';
  });

  // A real browser lists the finger that changed in changedTouches and every
  // finger on the screen in touches, each with a stable identifier.
  const finger = (identifier: number, clientX: number, clientY: number) => ({ identifier, clientX, clientY });

  test('touch drags report deltas and keep the page from scrolling', () => {
    const { onDrag, onStop, node } = setup();
    // Not cancelable means the listener couldn't stop the scroll: React's
    // own touch listeners are passive, so the hook binds touchstart natively.
    const f = finger(7, 10, 10);
    const start = fireEvent.touchStart(node, { touches: [f], changedTouches: [f] });
    expect(start).toBe(false);
    const moved = finger(7, 25, 4);
    const move = fireEvent.touchMove(document, { touches: [moved], changedTouches: [moved] });
    expect(move).toBe(false);
    fireEvent.touchEnd(document, { touches: [], changedTouches: [moved] });
    expect(deltas(onDrag)).toEqual([[15, -6]]);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test('a touch drag follows only the finger that started it', () => {
    const { onDrag, onStop, node } = setup();
    // Finger 1 is already down elsewhere, so it is touches[0]; finger 2 starts
    // the drag on the node.
    const other = finger(1, 500, 500);
    fireEvent.touchStart(node, { touches: [other, finger(2, 10, 10)], changedTouches: [finger(2, 10, 10)] });

    // Both move: the node follows finger 2 only.
    fireEvent.touchMove(document, {
      touches: [finger(1, 600, 650), finger(2, 30, 20)],
      changedTouches: [finger(1, 600, 650), finger(2, 30, 20)],
    });
    // Only finger 1 moves: the node doesn't, and the page doesn't scroll or
    // pinch-zoom either while the drag runs.
    const otherOnly = fireEvent.touchMove(document, {
      touches: [finger(1, 700, 700), finger(2, 30, 20)],
      changedTouches: [finger(1, 700, 700)],
    });
    expect(otherOnly).toBe(false);
    expect(deltas(onDrag)).toEqual([[20, 10]]);

    // Finger 1 lifting neither ends nor commits the drag.
    fireEvent.touchEnd(document, { touches: [finger(2, 30, 20)], changedTouches: [finger(1, 700, 700)] });
    expect(onStop).not.toHaveBeenCalled();

    fireEvent.touchEnd(document, { touches: [], changedTouches: [finger(2, 30, 20)] });
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test('a second finger landing on the node does not restart the drag', () => {
    const { onDrag, onStop, node } = setup();
    fireEvent.touchStart(node, { touches: [finger(1, 10, 10)], changedTouches: [finger(1, 10, 10)] });
    fireEvent.touchStart(node, {
      touches: [finger(1, 10, 10), finger(2, 300, 300)],
      changedTouches: [finger(2, 300, 300)],
    });

    // Finger 2 moving or lifting must not drag or commit anything.
    fireEvent.touchMove(document, {
      touches: [finger(1, 10, 10), finger(2, 340, 320)],
      changedTouches: [finger(2, 340, 320)],
    });
    fireEvent.touchEnd(document, { touches: [finger(1, 10, 10)], changedTouches: [finger(2, 340, 320)] });
    expect(onDrag).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();

    // Finger 1 still drives the drag, measured from its own start.
    fireEvent.touchMove(document, { touches: [finger(1, 15, 12)], changedTouches: [finger(1, 15, 12)] });
    expect(deltas(onDrag)).toEqual([[5, 2]]);
  });

  test('touchcancel ends the drag like a release', () => {
    const { onDrag, onStop, node } = setup();
    fireEvent.touchStart(node, { touches: [finger(3, 10, 10)], changedTouches: [finger(3, 10, 10)] });
    fireEvent.touchCancel(document, { touches: [], changedTouches: [finger(3, 10, 10)] });
    expect(onStop).toHaveBeenCalledTimes(1);

    fireEvent.touchMove(document, { touches: [finger(3, 40, 40)], changedTouches: [finger(3, 40, 40)] });
    expect(onDrag).not.toHaveBeenCalled();
  });

  test('unmounting mid-drag removes its document listeners and restores selection', () => {
    document.body.style.userSelect = 'text';
    const { onDrag, onStop, node, unmount } = setup();
    fireEvent.mouseDown(node, { clientX: 0, clientY: 0, button: 0 });
    unmount();
    expect(document.body.style.userSelect).toBe('text');
    fireEvent.mouseMove(document, { clientX: 30, clientY: 30 });
    fireEvent.mouseUp(document);
    expect(onDrag).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
    document.body.style.userSelect = '';
  });
});
