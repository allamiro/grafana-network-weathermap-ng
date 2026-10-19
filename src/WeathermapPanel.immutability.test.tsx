// Every panel interaction that persists options must deliver NEW state and
// never write into the options Grafana handed us. The options are deep-frozen,
// so an in-place write throws (our modules are strict mode). Each test checks
// three things: nothing threw, onOptionsChange got a new weathermap object
// (not the rendered one), and the change is in that object.
//
// These are the onOptionsChange producers in WeathermapPanel.tsx. Pan, VIA
// insert/remove and node drag are covered the same way in
// WeathermapPanel.test.tsx (#225, #238).
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps, toDataFrame } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { fireEvent, render, screen } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions, Weathermap } from 'types';
import { CURRENT_VERSION, handleVersionedStateUpdates } from 'utils';
import { getData, theme } from 'testData';
import { deepFreeze } from './test/deepFreeze';

let getSearchSpy: jest.SpyInstance | undefined;
const enterEditMode = () => {
  getSearchSpy = jest.spyOn(locationService, 'getSearch').mockReturnValue(new URLSearchParams('editPanel=1'));
};

// React reports an error thrown in an event handler or effect through the
// window 'error' event rather than out of fireEvent, so a handler that throws
// after it has already called onOptionsChange would otherwise go unnoticed.
let uncaught: string[] = [];
const recordUncaught = (e: ErrorEvent) => {
  uncaught.push(String(e.error ?? e.message));
};
beforeEach(() => {
  uncaught = [];
  window.addEventListener('error', recordUncaught);
});
afterEach(() => {
  window.removeEventListener('error', recordUncaught);
  getSearchSpy?.mockRestore();
  getSearchSpy = undefined;
});

const renderFrozen = (weathermap: Weathermap, data: Partial<PanelProps['data']> = {}) => {
  const options = deepFreeze({ weathermap });
  const onOptionsChange = jest.fn();
  const props = {
    id: 1,
    data: { state: LoadingState.Done, series: [], timeRange: getDefaultRelativeTimeRange(), ...data },
    timeRange: getDefaultRelativeTimeRange(),
    timeZone: getTimeZone(),
    options,
    transparent: false,
    width: 600,
    height: 400,
    fieldConfig: {},
    renderCounter: 1,
    title: 'T',
    eventBus: {},
    onOptionsChange,
  } as unknown as PanelProps<SimpleOptions>;
  const utils = render(<WeathermapPanel {...props} />);
  return { ...utils, options, onOptionsChange };
};

const currentMap = () => handleVersionedStateUpdates(getData(theme), theme);

// The single persisted weathermap, after checking it is new state.
const persistedOnce = (onOptionsChange: jest.Mock, rendered: Weathermap): Weathermap => {
  expect(uncaught).toEqual([]);
  expect(onOptionsChange).toHaveBeenCalledTimes(1);
  const persisted: Weathermap = onOptionsChange.mock.calls[0][0].weathermap;
  expect(persisted).not.toBe(rendered);
  return persisted;
};

// Pointer gestures are dispatched as MouseEvents: jsdom's PointerEvent drops
// clientX/button, see WeathermapPanel.polyline.test.tsx.
const firePointer = (el: Element, type: string, opts: MouseEventInit = {}) =>
  fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...opts }));

describe('options persisted after render', () => {
  test('migrating an old map persists a new, migrated weathermap', () => {
    // getData() is schema version 1; the panel migrates it for render and
    // persists the result from an effect.
    const weathermap = getData(theme);
    const { onOptionsChange, options } = renderFrozen(weathermap);

    const persisted = persistedOnce(onOptionsChange, options.weathermap);
    expect(persisted.version).toBe(CURRENT_VERSION);
    expect(options.weathermap.version).toBe(1);
  });

  test('repairing a current-version map that lacks settings.panel persists a new weathermap (#224)', () => {
    const weathermap = currentMap();
    delete (weathermap.settings as unknown as Record<string, unknown>).panel;
    const { onOptionsChange, options } = renderFrozen(weathermap);

    const persisted = persistedOnce(onOptionsChange, options.weathermap);
    expect(persisted.settings.panel.panelSize).toEqual({ width: 600, height: 600 });
    expect(options.weathermap.settings.panel).toBeUndefined();
  });

  test('rebinding a legacy query name persists a new weathermap (#331)', () => {
    const weathermap = currentMap();
    // 'Interface A' is the legacy name (first non-time field); the link must
    // be rebound to the value field 'Throughput A'.
    weathermap.links[0].sides.A.query = 'Interface A';
    const frame = toDataFrame({
      refId: 'A',
      fields: [
        { name: 'Time', values: [1, 2] },
        { name: 'iface', type: 'string', values: ['a', 'b'], config: { displayNameFromDS: 'Interface A' } },
        { name: 'bps', values: [777, 777], config: { displayNameFromDS: 'Throughput A' } },
      ],
    });
    const { onOptionsChange, options } = renderFrozen(weathermap, { series: [frame] });

    const persisted = persistedOnce(onOptionsChange, options.weathermap);
    expect(persisted.links[0].sides.A.query).toBe('Throughput A');
    expect(options.weathermap.links[0].sides.A.query).toBe('Interface A');
  });
});

describe('wheel zoom (#45, #50)', () => {
  test('edit mode wheel persists a new zoomScale', () => {
    enterEditMode();
    const { container, onOptionsChange, options } = renderFrozen(currentMap());
    fireEvent.wheel(container.querySelector('svg[id^="nw-"]')!, { deltaY: 100 });

    const persisted = persistedOnce(onOptionsChange, options.weathermap);
    expect(persisted.settings.panel.zoomScale).toBe(1);
    expect(options.weathermap.settings.panel.zoomScale).toBe(0);
  });

  test('view mode Shift+wheel persists a new zoomScale', () => {
    const { container, onOptionsChange, options } = renderFrozen(currentMap());
    fireEvent.wheel(container.querySelector('svg[id^="nw-"]')!, { deltaY: -100, shiftKey: true });

    const persisted = persistedOnce(onOptionsChange, options.weathermap);
    expect(persisted.settings.panel.zoomScale).toBe(-1);
    expect(options.weathermap.settings.panel.zoomScale).toBe(0);
  });
});

describe('waypoints (#336)', () => {
  const withWaypoint = () => {
    const wm = currentMap();
    wm.links[0].waypoints = [{ x: 260, y: 200 }];
    return wm;
  };

  test('right-clicking a link persists a new weathermap with the added waypoint', () => {
    enterEditMode();
    const { container, onOptionsChange, options } = renderFrozen(currentMap());
    fireEvent.contextMenu(container.querySelector('g[data-testid="link"]')!, { clientX: 300, clientY: 300 });

    const persisted = persistedOnce(onOptionsChange, options.weathermap);
    // jsdom has no CTM, so the handler falls back to the path midpoint.
    expect(persisted.links[0].waypoints).toEqual([{ x: 300, y: 300 }]);
    expect(options.weathermap.links[0].waypoints).toBeUndefined();
  });

  test('dragging a waypoint handle persists a new weathermap with the moved waypoint', () => {
    enterEditMode();
    const { container, onOptionsChange, options } = renderFrozen(withWaypoint());
    const handle = container.querySelector('[data-testid="waypoint-handle"]')!;
    firePointer(handle, 'pointerdown', { clientX: 100, clientY: 100 });
    firePointer(handle, 'pointermove', { clientX: 120, clientY: 90 });
    firePointer(handle, 'pointerup', { clientX: 120, clientY: 90 });

    const persisted = persistedOnce(onOptionsChange, options.weathermap);
    const [moved] = persisted.links[0].waypoints!;
    expect(moved.x).toBeGreaterThan(260);
    expect(moved.y).toBeLessThan(200);
    expect(options.weathermap.links[0].waypoints).toEqual([{ x: 260, y: 200 }]);
  });

  test('nudging a waypoint with the keyboard persists a new weathermap', () => {
    enterEditMode();
    const { container, onOptionsChange, options } = renderFrozen(withWaypoint());
    fireEvent.keyDown(container.querySelector('[data-testid="waypoint-handle"]')!, { key: 'ArrowRight' });

    const persisted = persistedOnce(onOptionsChange, options.weathermap);
    expect(persisted.links[0].waypoints).toEqual([{ x: 261, y: 200 }]);
    expect(options.weathermap.links[0].waypoints).toEqual([{ x: 260, y: 200 }]);
  });

  test('removing the last waypoint persists a new weathermap without the field', () => {
    enterEditMode();
    const { container, onOptionsChange, options } = renderFrozen(withWaypoint());
    fireEvent.contextMenu(container.querySelector('[data-testid="waypoint-handle"]')!);

    const persisted = persistedOnce(onOptionsChange, options.weathermap);
    expect(persisted.links[0].waypoints).toBeUndefined();
    expect(options.weathermap.links[0].waypoints).toEqual([{ x: 260, y: 200 }]);
  });
});

describe('node clicks', () => {
  // A click changes no options, so it must not persist anything. It used to
  // call onOptionsChange(options) with the same object to force a re-render
  // that ctrl-click selection needed while it mutated its state array in
  // place; selection returns a new array since #225, so the call only handed
  // Grafana an unchanged object on every click.
  test.each([
    ['edit mode click', true, {}],
    ['edit mode ctrl-click', true, { ctrlKey: true }],
    ['view mode click', false, {}],
  ])('%s persists nothing', (_name, edit, modifiers) => {
    if (edit) {
      enterEditMode();
    }
    const { onOptionsChange } = renderFrozen(currentMap());
    fireEvent.click(screen.getByText('Node A').closest('g')!, modifiers);

    expect(uncaught).toEqual([]);
    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  test('ctrl-click still toggles the selected border without an options write', () => {
    enterEditMode();
    const { onOptionsChange } = renderFrozen(currentMap());
    const nodeA = screen.getByText('Node A').closest('g')!;
    const border = () => nodeA.querySelector('rect')!.getAttribute('stroke');
    // Unselected: node.colors.border; selected: node.colors.font.
    expect(border()).toBe('#CCCCCC');

    fireEvent.click(nodeA, { ctrlKey: true });
    expect(border()).toBe('#FFFFFF');
    fireEvent.click(nodeA, { ctrlKey: true });
    expect(border()).toBe('#CCCCCC');
    expect(onOptionsChange).not.toHaveBeenCalled();
  });
});
