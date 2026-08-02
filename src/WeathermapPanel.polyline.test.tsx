// Polyline links (#332): a link with waypoints renders both directional
// halves as bent polylines, keeps its labels on the drawn path, and leaves
// straight links (no waypoints) exactly as before.
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps } from '@grafana/data';
import { fireEvent, render } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions, Weathermap } from 'types';
import { getData, theme } from 'testData';
import { handleVersionedStateUpdates, pointAtPathPercent } from 'utils';

const renderPanel = (mutate?: (wm: Weathermap) => void) => {
  const wm = handleVersionedStateUpdates(getData(theme), theme);
  if (mutate) {
    mutate(wm);
  }
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
  const utils = render(<WeathermapPanel {...props} />);
  return { ...utils, onOptionsChange };
};

const linkPolylines = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('g[data-testid="link"] polyline'));

const pointCount = (polyline: Element) => (polyline.getAttribute('points') ?? '').trim().split(/\s+/).length;

describe('polyline links (#332)', () => {
  test('a straight link renders both halves as two-point polylines (unchanged geometry)', () => {
    const { container } = renderPanel();
    const halves = linkPolylines(container);
    expect(halves.length).toBe(2);
    halves.forEach((p) => expect(pointCount(p)).toBe(2));
    // Nodes sit at y=300, so every rendered point stays on that horizontal.
    halves.forEach((p) => {
      (p.getAttribute('points') ?? '')
        .trim()
        .split(/\s+/)
        .forEach((pt) => expect(Number(pt.split(',')[1])).toBeCloseTo(300, 5));
    });
  });

  test('a waypoint bends the drawn path through its exact coordinates', () => {
    const { container } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
    });
    const halves = linkPolylines(container);
    expect(halves.length).toBe(2);
    const allPoints = halves.map((p) => p.getAttribute('points') ?? '').join(' ');
    // The waypoint is an exact vertex of one rendered half.
    expect(allPoints).toContain('260,200');
    // And at least one half now carries more than two points.
    expect(Math.max(...halves.map(pointCount))).toBeGreaterThan(2);
  });

  test('value labels sit on the bent path, not the straight chord', () => {
    const { container } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 300, y: 200 }];
    });
    // Both nodes are at y=300; on the straight chord every label lands at
    // y=300 exactly. On the bent path the label must leave that horizontal.
    const labels = Array.from(container.querySelectorAll('g[font-style="italic"]'));
    expect(labels.length).toBeGreaterThan(0);
    const ys = labels.map((l) => {
      const m = /translate\([-\d.]+,([-\d.]+)\)/.exec(l.getAttribute('transform') ?? '');
      return m ? Number(m[1]) : NaN;
    });
    ys.forEach((y) => expect(y).toBeLessThan(300));
  });

  test('waypoints are render-only state: rendering never writes panel options', () => {
    const { onOptionsChange } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
    });
    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  test('a saved map without waypoints round-trips migration without gaining any', () => {
    const wm = handleVersionedStateUpdates(getData(theme), theme);
    expect(wm.links[0].waypoints).toBeUndefined();
  });

  test('waypoints survive the versioned migration deep-merge', () => {
    const raw = getData(theme);
    raw.links[0].waypoints = [{ x: 111, y: 222 }];
    const wm = handleVersionedStateUpdates(raw, theme);
    expect(wm.links[0].waypoints).toEqual([{ x: 111, y: 222 }]);
  });
});

// Review hardening (#334): exact-position, side-consistency, and hostile-input
// guarantees on top of the shape assertions above.
describe('polyline links — precision and hardening (#334 review)', () => {
  test('the A value label sits at its exact arc-length position on the bent path', () => {
    const wp = { x: 300, y: 200 };
    const { container } = renderPanel((wm) => {
      wm.links[0].waypoints = [wp];
    });
    const halves = linkPolylines(container);
    const firstPoint = (p: Element) =>
      (p.getAttribute('points') ?? '').trim().split(/\s+/)[0].split(',').map(Number);
    const [ax, ay] = firstPoint(halves[0]);
    const [zx, zy] = firstPoint(halves[1]);
    const path = [{ x: ax, y: ay }, wp, { x: zx, y: zy }];
    // Default labelOffset 55 -> aPct = 27.5, measured from the A node.
    const expected = pointAtPathPercent(path, 0.275);
    const labels = Array.from(container.querySelectorAll('g[font-style="italic"]'));
    const positions = labels.map((l) => {
      const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(l.getAttribute('transform') ?? '');
      return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
    });
    const match = positions.some(
      (p) => p && Math.abs(p.x - expected.x) < 0.01 && Math.abs(p.y - expected.y) < 0.01
    );
    expect(match).toBe(true);
  });

  test('a collinear waypoint keeps both port labels on the same side as a straight link', () => {
    const { container } = renderPanel((wm) => {
      wm.links[0].sides.A.portLabel = 'eth-A';
      wm.links[0].sides.Z.portLabel = 'eth-Z';
      // Collinear with the horizontal link: bends nothing visually, but flips
      // hasBends on — the Z label must not switch sides (or rotate) because
      // of the internal path representation.
      wm.links[0].waypoints = [{ x: 300, y: 300 }];
    });
    const texts = Array.from(container.querySelectorAll('text')).filter((t) =>
      ['eth-A', 'eth-Z'].includes(t.textContent ?? '')
    );
    expect(texts).toHaveLength(2);
    const rotations = texts.map((t) => {
      const m = /rotate\(([-\d.]+)\)/.exec(t.parentElement?.getAttribute('transform') ?? '');
      return m ? Number(m[1]) : NaN;
    });
    // Forward-path direction is horizontal: both rotate by 0.
    rotations.forEach((r) => expect(r).toBeCloseTo(0, 5));
    // Same side of the line: both text y offsets are negative (above).
    texts.forEach((t) => expect(Number(t.getAttribute('y'))).toBeLessThan(0));
  });

  test('malformed saved waypoints render sanitized — no NaN reaches the SVG', () => {
    const { container } = renderPanel((wm) => {
      wm.links[0].waypoints = [
        { x: NaN, y: 100 },
        'garbage',
        { x: 260, y: 200 },
        { x: 5, y: Infinity },
      ] as never;
    });
    const halves = linkPolylines(container);
    expect(halves.length).toBe(2);
    const allPoints = halves.map((p) => p.getAttribute('points') ?? '').join(' ');
    expect(allPoints).toContain('260,200'); // the one valid waypoint survives
    expect(allPoints).not.toMatch(/NaN|Infinity/);
    expect(container.innerHTML).not.toContain('NaN');
  });
});

// Canvas waypoint handles + rounded corners (#336 items 1 & 2).
import { locationService } from '@grafana/runtime';

describe('waypoint drag handles and rounded corners (#336)', () => {
  let getSearchSpy: jest.SpyInstance | undefined;
  afterEach(() => {
    getSearchSpy?.mockRestore();
    getSearchSpy = undefined;
  });
  const enterEditMode = () => {
    getSearchSpy = jest
      .spyOn(locationService, 'getSearch')
      .mockReturnValue(new URLSearchParams('editPanel=1'));
  };
  // jsdom's PointerEvent does not inherit MouseEvent fields (clientX/button/
  // metaKey all arrive undefined), so dispatch MouseEvent-based pointer events
  // — which carry every field, exactly as real browsers do.
  const firePointer = (el: Element, type: string, opts: MouseEventInit = {}) =>
    fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...opts }));

  test('handles render only in edit mode, one per waypoint', () => {
    enterEditMode();
    const { container } = renderPanel((wm) => {
      wm.links[0].waypoints = [
        { x: 260, y: 200 },
        { x: 340, y: 220 },
      ];
    });
    expect(container.querySelectorAll('[data-testid="waypoint-handle"]')).toHaveLength(2);
  });

  test('no handles in view mode', () => {
    const { container } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
    });
    expect(container.querySelectorAll('[data-testid="waypoint-handle"]')).toHaveLength(0);
  });

  test('right-clicking a handle removes exactly that waypoint (single commit)', () => {
    enterEditMode();
    const { container, onOptionsChange } = renderPanel((wm) => {
      wm.links[0].waypoints = [
        { x: 260, y: 200 },
        { x: 340, y: 220 },
      ];
    });
    const handles = container.querySelectorAll('[data-testid="waypoint-handle"]');
    fireEvent.contextMenu(handles[0]);
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    const saved = onOptionsChange.mock.calls[0][0].weathermap;
    expect(saved.links[0].waypoints).toEqual([{ x: 340, y: 220 }]);
  });

  test('removing the last waypoint deletes the field entirely', () => {
    enterEditMode();
    const { container, onOptionsChange } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
    });
    fireEvent.contextMenu(container.querySelector('[data-testid="waypoint-handle"]')!);
    const saved = onOptionsChange.mock.calls[0][0].weathermap;
    expect(saved.links[0].waypoints).toBeUndefined();
  });

  test('dragging a handle (pointer events) commits the moved waypoint once, on release', () => {
    enterEditMode();
    const { container, onOptionsChange } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
    });
    const handle = container.querySelector('[data-testid="waypoint-handle"]')!;
    firePointer(handle, 'pointerdown', { clientX: 100, clientY: 100 });
    firePointer(handle, 'pointermove', { clientX: 120, clientY: 90 });
    expect(onOptionsChange).not.toHaveBeenCalled(); // preview only while dragging
    firePointer(handle, 'pointerup', { clientX: 120, clientY: 90 });
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    const saved = onOptionsChange.mock.calls[0][0].weathermap;
    const moved = saved.links[0].waypoints[0];
    expect(moved.x).toBeGreaterThan(260); // moved right
    expect(moved.y).toBeLessThan(200); // moved up
  });

  test('a modifier-key pointerdown never starts a waypoint drag (pan stays pan)', () => {
    enterEditMode();
    const { container, onOptionsChange } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
    });
    const handle = container.querySelector('[data-testid="waypoint-handle"]')!;
    firePointer(handle, 'pointerdown', { clientX: 100, clientY: 100, metaKey: true });
    firePointer(handle, 'pointermove', { clientX: 150, clientY: 60 });
    firePointer(handle, 'pointerup', { clientX: 150, clientY: 60 });
    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  test('a canceled pointer reverts the preview and commits nothing', () => {
    enterEditMode();
    const { container, onOptionsChange } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
    });
    const handle = container.querySelector('[data-testid="waypoint-handle"]')!;
    firePointer(handle, 'pointerdown', { clientX: 100, clientY: 100 });
    firePointer(handle, 'pointermove', { clientX: 140, clientY: 80 });
    firePointer(handle, 'pointercancel');
    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  test('arrow keys nudge a focused handle; Delete removes it', () => {
    enterEditMode();
    const { container, onOptionsChange } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
    });
    const handle = container.querySelector('[data-testid="waypoint-handle"]')!;
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange.mock.calls[0][0].weathermap.links[0].waypoints[0]).toEqual({ x: 261, y: 200 });
    fireEvent.keyDown(handle, { key: 'ArrowUp', shiftKey: true });
    expect(onOptionsChange.mock.calls[1][0].weathermap.links[0].waypoints[0]).toEqual({ x: 260, y: 190 });
    fireEvent.keyDown(handle, { key: 'Delete' });
    expect(onOptionsChange.mock.calls[2][0].weathermap.links[0].waypoints).toBeUndefined();
  });

  test('right-clicking a link in edit mode inserts a waypoint (VIA double-click untouched)', () => {
    enterEditMode();
    const { container, onOptionsChange } = renderPanel();
    const linkGroup = container.querySelector('g[data-testid="link"]')!;
    fireEvent.contextMenu(linkGroup, { clientX: 300, clientY: 300 });
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    const saved = onOptionsChange.mock.calls[0][0].weathermap;
    // jsdom has no CTM, so the handler falls back to the path midpoint.
    expect(saved.links[0].waypoints).toHaveLength(1);
    const wp = saved.links[0].waypoints[0];
    expect(wp.y).toBeCloseTo(300, 0); // on the horizontal link
  });

  test('cornerRadius flattens bends into curves — the sharp vertex disappears', () => {
    const { container } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
      wm.links[0].cornerRadius = 15;
    });
    const halves = linkPolylines(container);
    const allPoints = halves.map((p) => p.getAttribute('points') ?? '').join(' ');
    expect(allPoints).not.toContain('260,200'); // vertex replaced by curve points
    expect(Math.max(...halves.map(pointCount))).toBeGreaterThan(4); // dense flattening
    expect(allPoints).not.toMatch(/NaN/);
  });
});
