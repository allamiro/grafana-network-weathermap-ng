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
    fireEvent.touchStart(node, { touches: [{ clientX: 0, clientY: 0 }] });
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

  test('touch drags report deltas and keep the page from scrolling', () => {
    const { onDrag, onStop, node } = setup();
    // Not cancelable means the listener couldn't stop the scroll: React's
    // own touch listeners are passive, so the hook binds touchstart natively.
    const start = fireEvent.touchStart(node, { touches: [{ clientX: 10, clientY: 10 }] });
    expect(start).toBe(false);
    const move = fireEvent.touchMove(document, { touches: [{ clientX: 25, clientY: 4 }] });
    expect(move).toBe(false);
    fireEvent.touchEnd(document, { changedTouches: [{ clientX: 25, clientY: 4 }] });
    expect(deltas(onDrag)).toEqual([[15, -6]]);
    expect(onStop).toHaveBeenCalledTimes(1);
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
