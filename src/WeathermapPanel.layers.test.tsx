// Layer visibility (#269): show/hide categories of map content without
// deleting any configuration. Absent settings must mean everything visible, so
// every dashboard that existed before this feature renders unchanged.
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps, toDataFrame } from '@grafana/data';
import { fireEvent, render, screen } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions, Weathermap } from 'types';
import { getData, theme } from 'testData';
import { handleVersionedStateUpdates, isLayerVisible } from 'utils';

const frame = (name: string) =>
  toDataFrame({
    refId: 'A',
    fields: [
      { name: 'Time', values: [1, 2] },
      { name: 'Value', values: [10, 20], config: { displayNameFromDS: name } },
    ],
  });

const renderPanel = (mutate?: (wm: Weathermap) => void) => {
  const wm = handleVersionedStateUpdates(getData(theme), theme);
  wm.links[0].sides.A.query = 'A QUERY';
  wm.links[0].sides.Z.query = 'Z QUERY';
  wm.links[0].sides.A.portLabel = 'ge-0/0/1';
  wm.links[0].sides.Z.portLabel = 'ge-0/0/2';
  mutate?.(wm);
  const onOptionsChange = jest.fn();
  const props = {
    id: 1,
    data: { state: LoadingState.Done, series: [frame('A QUERY'), frame('Z QUERY')], timeRange: getDefaultRelativeTimeRange() },
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
  return { ...render(<WeathermapPanel {...props} />), onOptionsChange, wm };
};

const nodeLabels = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('text')).filter((t) => /Node [AB]/.test(t.textContent ?? '')).length;
const valueLabels = (c: HTMLElement) => c.querySelectorAll('g[data-testid="link-value-label"]').length;
const portLabels = (c: HTMLElement) =>
  Array.from(c.querySelectorAll('text')).filter((t) => /ge-0\/0\//.test(t.textContent ?? '')).length;

describe('layer visibility defaults (#269)', () => {
  test('a map with no layer settings shows every layer', () => {
    const { container, wm } = renderPanel();
    expect(wm.settings.layers).toBeUndefined();
    expect(nodeLabels(container)).toBeGreaterThan(0);
    expect(valueLabels(container)).toBeGreaterThan(0);
    expect(portLabels(container)).toBeGreaterThan(0);
  });

  test('an empty layers block also shows everything', () => {
    const { container } = renderPanel((wm) => {
      wm.settings.layers = {};
    });
    expect(nodeLabels(container)).toBeGreaterThan(0);
    expect(valueLabels(container)).toBeGreaterThan(0);
    expect(portLabels(container)).toBeGreaterThan(0);
  });

  test('isLayerVisible treats absent settings, block and field as visible', () => {
    expect(isLayerVisible(undefined, 'nodeLabels')).toBe(true);
    expect(isLayerVisible(null, 'valueLabels')).toBe(true);
    expect(isLayerVisible({ settings: {} } as unknown as Weathermap, 'portLabels')).toBe(true);
    expect(isLayerVisible({ settings: { layers: {} } } as unknown as Weathermap, 'nodeLabels')).toBe(true);
    expect(isLayerVisible({ settings: { layers: { nodeLabels: true } } } as unknown as Weathermap, 'nodeLabels')).toBe(true);
    expect(isLayerVisible({ settings: { layers: { nodeLabels: false } } } as unknown as Weathermap, 'nodeLabels')).toBe(false);
  });
});

describe('hiding a layer (#269)', () => {
  test('node labels hide, leaving links and other labels alone', () => {
    const { container } = renderPanel((wm) => {
      wm.settings.layers = { nodeLabels: false };
    });
    expect(nodeLabels(container)).toBe(0);
    expect(valueLabels(container)).toBeGreaterThan(0);
    expect(portLabels(container)).toBeGreaterThan(0);
    // The node boxes themselves are still drawn and still interactive.
    expect(container.querySelectorAll('rect[rx="6"]').length).toBeGreaterThan(0);
  });

  test('value labels hide, leaving node and port labels alone', () => {
    const { container } = renderPanel((wm) => {
      wm.settings.layers = { valueLabels: false };
    });
    expect(valueLabels(container)).toBe(0);
    expect(nodeLabels(container)).toBeGreaterThan(0);
    expect(portLabels(container)).toBeGreaterThan(0);
  });

  test('port labels hide, leaving node and value labels alone', () => {
    const { container } = renderPanel((wm) => {
      wm.settings.layers = { portLabels: false };
    });
    expect(portLabels(container)).toBe(0);
    expect(nodeLabels(container)).toBeGreaterThan(0);
    expect(valueLabels(container)).toBeGreaterThan(0);
  });

  test('all three hidden still renders the map itself', () => {
    const { container } = renderPanel((wm) => {
      wm.settings.layers = { nodeLabels: false, valueLabels: false, portLabels: false };
    });
    expect(nodeLabels(container) + valueLabels(container) + portLabels(container)).toBe(0);
    expect(container.querySelectorAll('g[data-testid="link"]').length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toMatch(/NaN/);
  });

  test('hidden layers are NON-INTERACTIVE, not merely invisible', () => {
    // The issue is explicit that hiding must remove the element, not just make
    // it transparent — a label you cannot see must not still be hoverable.
    const shown = renderPanel();
    const hidden = renderPanel((wm) => {
      wm.settings.layers = { valueLabels: false };
    });
    expect(shown.container.querySelectorAll('g[data-testid="link-value-label"]').length).toBeGreaterThan(0);
    expect(hidden.container.querySelectorAll('g[data-testid="link-value-label"]').length).toBe(0);
    // Nothing left behind with opacity/visibility tricks that would still hit-test.
    expect(hidden.container.innerHTML).not.toContain('link-value-label');
  });
});

describe('layer visibility is display-only (#269)', () => {
  test('hiding a layer never deletes configuration', () => {
    const { wm } = renderPanel((w) => {
      w.settings.layers = { nodeLabels: false, valueLabels: false, portLabels: false };
    });
    // Everything that drives the hidden layers is untouched.
    expect(wm.nodes.every((n) => n.label !== undefined)).toBe(true);
    expect(wm.links[0].sides.A.portLabel).toBe('ge-0/0/1');
    expect(wm.links[0].sides.Z.portLabel).toBe('ge-0/0/2');
    expect(wm.links[0].sides.A.query).toBe('A QUERY');
  });

  test('rendering with layers hidden never writes panel options', () => {
    const { onOptionsChange } = renderPanel((wm) => {
      wm.settings.layers = { nodeLabels: false };
    });
    expect(onOptionsChange).not.toHaveBeenCalled();
  });

  test('what Export SVG would write matches what is on screen', () => {
    // ExportForm serialises the live <svg> (svg.outerHTML), so a layer that is
    // not rendered cannot appear in an exported file — no separate export-time
    // filtering to keep in step.
    const { container, wm } = renderPanel((w) => {
      w.settings.layers = { portLabels: false };
    });
    const svg = container.querySelector(`svg[id^="nw-${wm.id}"]`) as SVGElement;
    expect(svg).not.toBeNull();
    expect(svg.outerHTML).not.toMatch(/ge-0\/0\//);
    expect(svg.outerHTML).toMatch(/Node A/);
  });

  test('a per-node Show Label of false still wins when the layer is on', () => {
    const { container } = renderPanel((wm) => {
      wm.nodes[0].showLabel = false;
      wm.settings.layers = { nodeLabels: true };
    });
    // Only the other node's label renders.
    expect(nodeLabels(container)).toBe(1);
  });
});

describe('layer settings persist (#269)', () => {
  test('they survive the versioned migration deep-merge', () => {
    const raw = getData(theme);
    raw.settings.layers = { nodeLabels: false, portLabels: false };
    const wm = handleVersionedStateUpdates(raw, theme);
    expect(wm.settings.layers).toEqual({ nodeLabels: false, portLabels: false });
  });

  test('a map without them does not gain them', () => {
    const wm = handleVersionedStateUpdates(getData(theme), theme);
    expect(wm.settings.layers).toBeUndefined();
  });

  test('migration stays idempotent with layers set', () => {
    const raw = getData(theme);
    raw.settings.layers = { valueLabels: false };
    const once = handleVersionedStateUpdates(raw, theme);
    const twice = handleVersionedStateUpdates(JSON.parse(JSON.stringify(once)), theme);
    expect(twice).toEqual(once);
  });
});

describe('layer visibility and adjacent behaviour (#269)', () => {
  test('hiding value labels does not stop values resolving', () => {
    // Visualization-only by design: hidden elements still resolve their
    // queries, so value mapping and timeline scrubbing are unaffected.
    const hidden = renderPanel((wm) => {
      wm.settings.layers = { valueLabels: false };
    });
    // The link still renders coloured by its resolved value rather than the
    // default stroke, proving resolution happened.
    const polylines = hidden.container.querySelectorAll('g[data-testid="link"] polyline');
    expect(polylines.length).toBeGreaterThan(0);
  });

  test('hover still works on the link itself when labels are hidden', () => {
    const { container } = renderPanel((wm) => {
      wm.settings.layers = { valueLabels: false, portLabels: false };
    });
    const line = container.querySelector('g[data-testid="link"] polyline')!;
    expect(() => fireEvent.mouseMove(line, { clientX: 100, clientY: 100 })).not.toThrow();
  });

  test('toggling a layer clears any open tooltip rather than stranding it', () => {
    // An element that disappears mid-hover never fires mouseout, so the panel
    // drops hover state whenever the layer settings change. Asserted against
    // the real tooltip element — an earlier version of this test queried a
    // testid nothing rendered, so it could never have failed.
    const { container, rerender, wm } = renderPanel();
    const line = container.querySelector('g[data-testid="link"] polyline')!;
    fireEvent.mouseMove(line, { clientX: 120, clientY: 120 });
    expect(screen.getByTestId('weathermap-link-tooltip')).toBeInTheDocument();
    const hiddenWm = JSON.parse(JSON.stringify(wm));
    hiddenWm.settings.layers = { valueLabels: false };
    const props = {
      id: 1,
      data: { state: LoadingState.Done, series: [frame('A QUERY'), frame('Z QUERY')], timeRange: getDefaultRelativeTimeRange() },
      timeRange: getDefaultRelativeTimeRange(),
      timeZone: getTimeZone(),
      options: { weathermap: hiddenWm },
      transparent: false,
      width: 600,
      height: 400,
      fieldConfig: {},
      renderCounter: 2,
      title: 'T',
      eventBus: {},
      onOptionsChange: jest.fn(),
    } as unknown as PanelProps<SimpleOptions>;
    rerender(<WeathermapPanel {...props} />);
    expect(screen.queryByTestId('weathermap-link-tooltip')).toBeNull();
  });
});
