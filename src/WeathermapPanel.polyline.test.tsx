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

// Link Offset now combines with waypoints (#336 item 3). The whole polyline is
// translated along the A->Z chord normal, so its shape and arc length survive
// intact; waypoints stay STORED unshifted and only the drawing moves.
describe('linkOffset on polyline links (#336)', () => {
  let getSearchSpy: jest.SpyInstance | undefined;
  afterEach(() => {
    getSearchSpy?.mockRestore();
    getSearchSpy = undefined;
  });
  const enterEditMode = () => {
    getSearchSpy = jest.spyOn(locationService, 'getSearch').mockReturnValue(new URLSearchParams('editPanel=1'));
  };
  const firePointer = (el: Element, type: string, opts: MouseEventInit = {}) =>
    fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...opts }));

  // Every rendered point of both halves, in order.
  const drawnPoints = (container: HTMLElement) =>
    linkPolylines(container).flatMap((p) =>
      (p.getAttribute('points') ?? '')
        .trim()
        .split(/\s+/)
        .map((pt) => {
          const [x, y] = pt.split(',').map(Number);
          return { x, y };
        })
    );

  // The house fixture's nodes both sit at y=300, so the A->Z chord is
  // horizontal and its normal is +y: a linkOffset of 20 shifts the link down
  // by exactly 20.
  test('a straight link with an offset keeps its pre-#336 geometry', () => {
    const { container } = renderPanel((wm) => {
      wm.links[0].linkOffset = 20;
    });
    const halves = linkPolylines(container);
    expect(halves.length).toBe(2);
    halves.forEach((p) => expect(pointCount(p)).toBe(2));
    drawnPoints(container).forEach((p) => expect(p.y).toBeCloseTo(320, 5));
  });

  test('an offset shifts the whole bent path rigidly — same shape, no distortion', () => {
    const bend = (wm: Weathermap) => {
      wm.links[0].waypoints = [
        { x: 260, y: 200 },
        { x: 340, y: 240 },
      ];
      wm.links[0].cornerRadius = 18;
    };
    const plain = drawnPoints(renderPanel(bend).container);
    const shifted = drawnPoints(
      renderPanel((wm) => {
        bend(wm);
        wm.links[0].linkOffset = 20;
      }).container
    );
    // Identical structure (rounding is unaffected) and an exact rigid shift.
    expect(shifted).toHaveLength(plain.length);
    expect(plain.length).toBeGreaterThan(4);
    shifted.forEach((p, i) => {
      expect(p.x).toBeCloseTo(plain[i].x, 5);
      expect(p.y).toBeCloseTo(plain[i].y + 20, 5);
    });
  });

  test('the bend point itself lands at waypoint + offset, not at the stored coordinate', () => {
    const { container } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
      wm.links[0].linkOffset = 20;
    });
    const all = linkPolylines(container)
      .map((p) => p.getAttribute('points') ?? '')
      .join(' ');
    expect(all).toContain('260,220');
    expect(all).not.toContain('260,200');
    expect(all).not.toMatch(/NaN/);
  });

  test('opposite offsets spread a bundle apart without ever touching', () => {
    const bend = (wm: Weathermap) => {
      wm.links[0].waypoints = [{ x: 300, y: 220 }];
    };
    const lo = drawnPoints(
      renderPanel((wm) => {
        bend(wm);
        wm.links[0].linkOffset = -12;
      }).container
    );
    const hi = drawnPoints(
      renderPanel((wm) => {
        bend(wm);
        wm.links[0].linkOffset = 12;
      }).container
    );
    expect(lo).toHaveLength(hi.length);
    lo.forEach((p, i) => expect(hi[i].y - p.y).toBeCloseTo(24, 5));
  });

  test('drag handles sit on the drawn line, at waypoint + offset', () => {
    enterEditMode();
    const { container } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
      wm.links[0].linkOffset = 20;
    });
    const handle = container.querySelector('[data-testid="waypoint-handle"]')!;
    expect(Number(handle.getAttribute('cx'))).toBeCloseTo(260, 5);
    expect(Number(handle.getAttribute('cy'))).toBeCloseTo(220, 5);
  });

  test('dragging an offset link commits stored coordinates — the link never creeps', () => {
    // The failure this guards: mixing drawn and stored space would add
    // linkOffset to the waypoint on every gesture, walking the link away by 20px
    // per drag. A zero-distance drag must round-trip the waypoint unchanged.
    enterEditMode();
    const { container, onOptionsChange } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
      wm.links[0].linkOffset = 20;
    });
    const handle = container.querySelector('[data-testid="waypoint-handle"]')!;
    firePointer(handle, 'pointerdown', { clientX: 100, clientY: 100 });
    firePointer(handle, 'pointermove', { clientX: 100, clientY: 100 });
    firePointer(handle, 'pointerup', { clientX: 100, clientY: 100 });
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    expect(onOptionsChange.mock.calls[0][0].weathermap.links[0].waypoints[0]).toEqual({ x: 260, y: 200 });
  });

  test('keyboard nudges on an offset link stay in stored space', () => {
    enterEditMode();
    const { container, onOptionsChange } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
      wm.links[0].linkOffset = 20;
    });
    fireEvent.keyDown(container.querySelector('[data-testid="waypoint-handle"]')!, { key: 'ArrowRight' });
    expect(onOptionsChange.mock.calls[0][0].weathermap.links[0].waypoints[0]).toEqual({ x: 261, y: 200 });
  });

  test('right-clicking an offset link stores the unshifted waypoint', () => {
    // The click lands on the DRAWN line (y=320 for a 20px offset); the saved
    // waypoint must come back through the offset to y=300, so that turning the
    // offset off leaves the link where it always was.
    enterEditMode();
    const { container, onOptionsChange } = renderPanel((wm) => {
      wm.links[0].linkOffset = 20;
    });
    fireEvent.contextMenu(container.querySelector('g[data-testid="link"]')!, { clientX: 300, clientY: 320 });
    expect(onOptionsChange).toHaveBeenCalledTimes(1);
    const saved = onOptionsChange.mock.calls[0][0].weathermap;
    expect(saved.links[0].waypoints).toHaveLength(1);
    expect(saved.links[0].waypoints[0].y).toBeCloseTo(300, 0);
  });

  test('an offset polyline renders without persisting anything', () => {
    const { onOptionsChange } = renderPanel((wm) => {
      wm.links[0].waypoints = [{ x: 260, y: 200 }];
      wm.links[0].linkOffset = 20;
    });
    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  test('linkOffset and waypoints survive the versioned migration together', () => {
    const raw = getData(theme);
    raw.links[0].linkOffset = 14;
    raw.links[0].waypoints = [{ x: 111, y: 222 }];
    const wm = handleVersionedStateUpdates(raw, theme);
    expect(wm.links[0].linkOffset).toBe(14);
    expect(wm.links[0].waypoints).toEqual([{ x: 111, y: 222 }]);
  });
});

// Gradient coloring follows the drawn path (#336 item 4).
describe('gradient coloring on bent links (#336)', () => {
  const withGradient = (mutate?: (wm: Weathermap) => void) =>
    renderPanel((wm) => {
      wm.settings.link.gradientColor = true;
      mutate?.(wm);
    });

  const stopsOf = (container: HTMLElement, which: 'a' | 'z' = 'a') =>
    Array.from(container.querySelectorAll(`linearGradient[id^="grad-${which}-"] stop`)).map((s) => ({
      offset: s.getAttribute('offset') ?? '',
      color: s.getAttribute('stop-color') ?? '',
    }));

  test('a straight link still renders exactly two stops at 0% and 100%', () => {
    const { container } = withGradient();
    const stops = stopsOf(container);
    expect(stops).toHaveLength(2);
    expect(stops[0].offset).toBe('0%');
    expect(stops[1].offset).toBe('100%');
  });

  test('a bent link renders a stop per path vertex, in non-decreasing order', () => {
    const { container } = withGradient((wm) => {
      wm.links[0].waypoints = [{ x: 300, y: 180 }];
    });
    const stops = stopsOf(container);
    expect(stops.length).toBeGreaterThan(2);
    const offsets = stops.map((s) => parseFloat(s.offset));
    offsets.forEach((o) => {
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(100);
      expect(Number.isNaN(o)).toBe(false);
    });
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThanOrEqual(offsets[i - 1]);
    }
    expect(offsets[0]).toBe(0);
    expect(offsets[offsets.length - 1]).toBe(100);
  });

  test('both halves sample identical stops, so there is no break at the arrow tips', () => {
    const { container } = withGradient((wm) => {
      wm.links[0].waypoints = [{ x: 300, y: 180 }];
    });
    expect(stopsOf(container, 'a')).toEqual(stopsOf(container, 'z'));
  });

  test('a rounded bend produces a dense, still-valid stop list', () => {
    const { container } = withGradient((wm) => {
      wm.links[0].waypoints = [
        { x: 260, y: 200 },
        { x: 340, y: 200 },
      ];
      wm.links[0].cornerRadius = 16;
    });
    const stops = stopsOf(container);
    expect(stops.length).toBeGreaterThan(8);
    stops.forEach((s) => {
      expect(s.offset).not.toMatch(/NaN/);
      expect(s.color).not.toMatch(/NaN/);
    });
  });

  test('the gradient axis moves with linkOffset', () => {
    const plain = withGradient();
    const shifted = withGradient((wm) => {
      wm.links[0].linkOffset = 20;
    });
    const axis = (c: HTMLElement) => {
      const g = c.querySelector('linearGradient[id^="grad-a-"]')!;
      return { y1: Number(g.getAttribute('y1')), y2: Number(g.getAttribute('y2')) };
    };
    const before = axis(plain.container);
    const after = axis(shifted.container);
    expect(after.y1).toBeCloseTo(before.y1 + 20, 5);
    expect(after.y2).toBeCloseTo(before.y2 + 20, 5);
  });

  test('gradient rendering never writes panel options', () => {
    const { onOptionsChange } = withGradient((wm) => {
      wm.links[0].waypoints = [{ x: 300, y: 180 }];
      wm.links[0].linkOffset = 12;
    });
    expect(onOptionsChange).not.toHaveBeenCalled();
  });
});
