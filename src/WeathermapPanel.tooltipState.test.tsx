// Regression tests for #375 / #377: rendering the link tooltip graph must not
// rewrite the cached display names in data.series. Grafana's <TimeSeries>
// deletes and recomputes field.state.displayName against only the tooltip's
// frames; when those copies share `state` with data.series, the frame-name
// prefix is dropped ("Traffic value x" -> "value x") and every later lookup —
// the next hover, node status, link values, tooltip extra metrics, editor
// query options — misses.
//
// The bound series sit in fields[2] of a wide frame on purpose: the legacy
// name pass (#331) recomputes fields[1] on each data change, which hides the
// corruption for the first value field.
import React from 'react';
import {
  DataFrame,
  dateTime,
  FieldType,
  getTimeZone,
  LoadingState,
  PanelData,
  PanelProps,
  toDataFrame,
} from '@grafana/data';
import { fireEvent, render, screen } from '@testing-library/react';
import { WeathermapPanel } from './WeathermapPanel';
import { SimpleOptions, Weathermap } from './types';
import { getData, getData2, theme } from './testData';
import { buildQueryOptions, handleVersionedStateUpdates } from './utils';

const timeRange = { from: dateTime(1000), to: dateTime(2000), raw: { from: 'now-1h', to: 'now' } };

const trafficFrame = () =>
  toDataFrame({
    name: 'Traffic',
    fields: [
      { name: 'time', type: FieldType.time, values: [1000, 2000] },
      { name: 'value', type: FieldType.number, values: [5, 5], labels: { metric: 'router-a: 10104' } },
      { name: 'value', type: FieldType.number, values: [0, 1], labels: { metric: 'router-a: 10105' } },
    ],
  });

// Two frames with different names, as with two datasources (#375): the full
// panel keeps the "Traffic" prefix, a Traffic-only subset would drop it.
const makeData = (): PanelData => ({
  state: LoadingState.Done,
  series: [
    trafficFrame(),
    toDataFrame({
      name: 'Link Status',
      fields: [
        { name: 'time', type: FieldType.time, values: [1000, 2000] },
        { name: 'value', type: FieldType.number, values: [1, 1], labels: { metric: 'status' } },
      ],
    }),
  ],
  timeRange,
});

const OUT = 'Traffic value router-a: 10105';
const IN = 'Traffic value router-a: 10104';

const panelProps = (
  data: PanelData,
  {
    build = getData,
    out = OUT,
    inbound = IN,
  }: { build?: (t: typeof theme) => Weathermap; out?: string; inbound?: string } = {}
): PanelProps<SimpleOptions> => {
  const weathermap = handleVersionedStateUpdates(build(theme), theme);
  // A and Z bound to different series, so the tooltip graphs two frames: with
  // a single frame Grafana caches the name as multipleFrames=false, and the
  // next full-series lookup recomputes it instead of reading the bad cache.
  weathermap.links.forEach((link) => {
    link.sides.A.query = out;
    link.sides.Z.query = inbound;
  });
  weathermap.nodes.forEach((node) => {
    node.statusQuery = out;
    node.colors.statusDown = '#ff0000';
  });
  return {
    id: 1,
    data,
    timeRange,
    timeZone: getTimeZone(),
    options: { weathermap },
    width: 600,
    height: 400,
    onOptionsChange: jest.fn(),
  } as unknown as PanelProps<SimpleOptions>;
};

const hoverAndLeave = (linkIndex = 0) => {
  const link = screen.getAllByTestId('link')[linkIndex].firstChild!;
  fireEvent.mouseMove(link, { clientX: 100, clientY: 150 });
  const graphShown = document.querySelector('canvas') !== null;
  fireEvent.mouseLeave(link);
  return graphShown;
};

const nodeIsDown = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('rect')).some((r) => r.getAttribute('stroke') === '#ff0000');

test('the link tooltip graph renders on every hover, not just the first (#375)', () => {
  render(<WeathermapPanel {...panelProps(makeData())} />);
  for (let hover = 1; hover <= 5; hover++) {
    expect(hoverAndLeave()).toBe(true);
  }
});

test('hovering one link does not break the graph of a different link (#375)', () => {
  const props = panelProps(makeData(), { build: getData2 });
  const [, second] = props.options.weathermap.links;
  second.sides.A.query = IN;
  second.sides.Z.query = OUT;
  render(<WeathermapPanel {...props} />);
  expect(hoverAndLeave(0)).toBe(true);
  expect(hoverAndLeave(1)).toBe(true);
  expect(hoverAndLeave(0)).toBe(true);
});

test('a single datasource keeps graphing on every hover (#375 control case)', () => {
  // One frame, so there is no frame-name prefix to lose: the names are the
  // same in the full panel and in the tooltip. This passed before the fix too
  // and guards against the fix regressing the common setup.
  const data: PanelData = { state: LoadingState.Done, series: [trafficFrame()], timeRange };
  render(<WeathermapPanel {...panelProps(data, { out: 'value router-a: 10105', inbound: 'value router-a: 10104' })} />);
  expect(hoverAndLeave()).toBe(true);
  expect(hoverAndLeave()).toBe(true);
});

test('a link hover leaves the cached series names in data.series unchanged (#377)', () => {
  const data = makeData();
  const before = buildQueryOptions(data.series).map((o) => o.value);
  render(<WeathermapPanel {...panelProps(data)} />);
  hoverAndLeave();
  // The editor's query dropdowns read these names; a corrupted one would be
  // saved as a binding that stops resolving after the next data refresh.
  expect(buildQueryOptions(data.series).map((o) => o.value)).toEqual(before);
});

test('node status still resolves after a link hover (#377)', () => {
  const props = panelProps(makeData());
  const { container, rerender } = render(<WeathermapPanel {...props} />);
  expect(nodeIsDown(container)).toBe(false);
  hoverAndLeave();
  rerender(<WeathermapPanel {...props} width={601} />);
  expect(nodeIsDown(container)).toBe(false);
});

test('link values still resolve after a link hover and remount (#377)', () => {
  const props = panelProps(makeData());
  const first = render(<WeathermapPanel {...props} />);
  expect(first.container.textContent).not.toContain('n/a');
  hoverAndLeave();
  first.unmount();
  const second = render(<WeathermapPanel {...props} />);
  expect(second.container.textContent).not.toContain('n/a');
  expect(second.container.textContent).toContain('1  b/s');
});

test('link and node tooltip extra metrics still resolve after a link hover and remount (#377)', () => {
  const props = panelProps(makeData());
  const { links, nodes } = props.options.weathermap;
  links[0].tooltipMetrics = [{ label: 'Errors', queryA: OUT, queryZ: OUT, units: 'short' }];
  nodes[0].tooltipMetrics = [{ label: 'Load', query: OUT, units: 'short' }];
  const first = render(<WeathermapPanel {...props} />);
  hoverAndLeave();
  first.unmount();
  render(<WeathermapPanel {...props} />);

  fireEvent.mouseMove(screen.getAllByTestId('link')[0].firstChild!, { clientX: 100, clientY: 150 });
  const linkMetric = screen.getByText(/^Errors - /);
  expect(linkMetric).not.toHaveTextContent('n/a');
  expect(linkMetric).toHaveTextContent(/: 1, .*: 1$/);
  fireEvent.mouseLeave(screen.getAllByTestId('link')[0].firstChild!);

  fireEvent.mouseMove(screen.getByText(nodes[0].label!).closest('g')!, { clientX: 100, clientY: 150 });
  expect(screen.getByTestId('weathermap-node-tooltip')).toHaveTextContent('Load: 1');
});

// Invariant behind #375 / #377 and the earlier stale line colours: hovering is
// read-only. Whatever a tooltip hands to Grafana must be a copy, so nothing a
// hover renders may change data.series. The tests above pin the symptoms; this
// one fails for any new write into the shared frames, whichever component or
// Grafana internal makes it.
describe('hovering never writes into data.series', () => {
  // Everything a hover could plausibly write: the cached display name, field
  // config (line colours), the display processor and the values themselves.
  const snapshot = (series: DataFrame[]) =>
    series.map((frame) => ({
      name: frame.name,
      fields: frame.fields.map((f) => ({
        name: f.name,
        type: f.type,
        labels: { ...f.labels },
        config: JSON.parse(JSON.stringify(f.config)),
        state: f.state === undefined ? undefined : JSON.parse(JSON.stringify(f.state)),
        display: f.display,
        values: Array.from(f.values),
      })),
    }));

  const shapes: Array<{ shape: string; series: () => DataFrame[]; out: string; inbound: string }> = [
    {
      // #375's setup: the frame-name prefix is only kept in the full panel.
      shape: 'two datasources, both series in one wide frame',
      series: () => makeData().series,
      out: OUT,
      inbound: IN,
    },
    {
      shape: 'one frame per series, each frame named differently',
      series: () => [
        toDataFrame({
          name: 'Inbound',
          fields: [
            { name: 'time', type: FieldType.time, values: [1000, 2000] },
            { name: 'value', type: FieldType.number, values: [3, 4] },
          ],
        }),
        toDataFrame({
          name: 'Outbound',
          fields: [
            { name: 'time', type: FieldType.time, values: [1000, 2000] },
            { name: 'value', type: FieldType.number, values: [1, 2] },
          ],
        }),
      ],
      out: 'Outbound value',
      inbound: 'Inbound value',
    },
    {
      shape: 'a single datasource',
      series: () => [trafficFrame()],
      out: 'value router-a: 10105',
      inbound: 'value router-a: 10104',
    },
    {
      // #364: the tooltip retypes a number time column on its own copy.
      shape: 'epoch-ms time column typed as a plain number',
      series: () => [
        toDataFrame({
          name: 'Traffic',
          fields: [
            { name: 'Time', type: FieldType.number, values: [1000, 2000] },
            { name: 'in', type: FieldType.number, values: [5, 5] },
            { name: 'out', type: FieldType.number, values: [0, 1] },
          ],
        }),
        makeData().series[1],
      ],
      out: 'Traffic out',
      inbound: 'Traffic in',
    },
  ];

  test.each(shapes)('$shape', ({ series, out, inbound }) => {
    const data: PanelData = { state: LoadingState.Done, series: series(), timeRange };
    const props = panelProps(data, { build: getData2, out, inbound });
    const { links, nodes } = props.options.weathermap;
    links.forEach((link) => {
      link.tooltipMetrics = [{ label: 'Errors', queryA: out, queryZ: inbound, units: 'short' }];
    });
    nodes.forEach((node) => {
      node.tooltipMetrics = [{ label: 'Load', query: out, units: 'short' }];
    });
    render(<WeathermapPanel {...props} />);
    // The first render legitimately caches names into field.state; compare
    // against the state after it, not against the raw frames.
    const before = snapshot(data.series);

    for (let pass = 0; pass < 2; pass++) {
      links.forEach((_, i) => {
        // Guards the guard: if the bindings stop resolving, no graph renders
        // and nothing is written, so the invariant would pass vacuously.
        expect(hoverAndLeave(i)).toBe(true);
      });
      nodes.forEach((node) => {
        const target = screen.getByText(node.label!).closest('g')!;
        fireEvent.mouseMove(target, { clientX: 100, clientY: 150 });
        expect(screen.getByTestId('weathermap-node-tooltip')).not.toHaveTextContent('n/a');
        fireEvent.mouseLeave(target);
      });
    }

    expect(snapshot(data.series)).toEqual(before);
  });
});
