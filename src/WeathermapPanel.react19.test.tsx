// #133 review (d8a582d): React 19 removed ReactDOM.findDOMNode. react-draggable's
// DraggableCore falls back to it (on mount, unmount and every drag event) unless
// it is given a `nodeRef`, so MapNode passes one. Jest runs React 18, where
// findDOMNode still exists, so this file replaces it with a recording stub that
// throws like React 19 would. react-draggable reaches it through
// `_interopRequireDefault(require('react-dom')).default.findDOMNode`, and since
// this mock has no __esModule flag, `.default` is this very object.
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { fireEvent, render, screen } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions, Weathermap } from 'types';
import { getData, theme } from 'testData';
import { handleVersionedStateUpdates } from 'utils';

const mockFindDOMNode = jest.fn(() => {
  throw new Error('findDOMNode was removed in React 19');
});
jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  findDOMNode: (...args: unknown[]) => mockFindDOMNode(...(args as [])),
}));

let getSearchSpy: jest.SpyInstance | undefined;
afterEach(() => {
  getSearchSpy?.mockRestore();
  getSearchSpy = undefined;
  mockFindDOMNode.mockClear();
});

describe('node dragging without ReactDOM.findDOMNode (#133)', () => {
  // #133 (d8a582d): dropping MapNode's nodeRef makes DraggableCore call
  // findDOMNode in componentDidMount, so the render itself throws. The call
  // count is asserted as well because a throw inside a drag event handler is
  // reported by jsdom rather than rethrown from fireEvent.
  test('nodes mount, drag and save in edit mode without findDOMNode', () => {
    getSearchSpy = jest.spyOn(locationService, 'getSearch').mockReturnValue(new URLSearchParams('editPanel=1'));
    const wm: Weathermap = handleVersionedStateUpdates(getData(theme), theme);
    const onOptionsChange = jest.fn();
    const props = {
      id: 1,
      data: { state: LoadingState.Done, series: [], timeRange: getDefaultRelativeTimeRange() },
      timeRange: getDefaultRelativeTimeRange(),
      timeZone: getTimeZone(),
      options: { weathermap: wm },
      transparent: false,
      width: 600,
      height: 400,
      fieldConfig: {},
      renderCounter: 1,
      title: 'T',
      eventBus: {},
      onOptionsChange,
    } as unknown as PanelProps<SimpleOptions>;

    const { unmount } = render(<WeathermapPanel {...props} />);
    expect(screen.getByText('Node A')).toBeInTheDocument();
    expect(screen.getByText('Node B')).toBeInTheDocument();

    const nodeA = screen.getByText('Node A').closest('g')!;
    fireEvent.mouseDown(nodeA, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.mouseMove(document, { clientX: 140, clientY: 120 });
    fireEvent.mouseUp(document, { button: 0, clientX: 140, clientY: 120 });

    // The drag really ran (so its handlers were exercised) and was persisted:
    // the (40, 20) pointer delta is scaled by the panel's aspect multiplier.
    const saved = onOptionsChange.mock.calls[onOptionsChange.mock.calls.length - 1][0].weathermap as Weathermap;
    expect(saved.nodes[0].position).toEqual([260, 330]);
    expect(saved.nodes[1].position).toEqual([400, 300]);

    unmount();
    expect(mockFindDOMNode).not.toHaveBeenCalled();
  });
});
