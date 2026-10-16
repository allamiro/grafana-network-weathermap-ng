// Regression tests for #375 / #377: rendering the link tooltip graph must not
// rewrite the cached display names in data.series. Grafana's <TimeSeries>
// deletes and recomputes field.state.displayName against only the tooltip's
// frames; when those copies share `state` with data.series, the frame-name
// prefix is dropped ("Traffic value x" -> "value x") and every later lookup —
// the next hover, node status, link values, editor query options — misses.
//
// The bound series sit in fields[2] of a wide frame on purpose: the legacy
// name pass (#331) recomputes fields[1] on each data change, which hides the
// corruption for the first value field.
import React from 'react';
import { dateTime, FieldType, getTimeZone, LoadingState, PanelData, PanelProps, toDataFrame } from '@grafana/data';
import { fireEvent, render, screen } from '@testing-library/react';
import { WeathermapPanel } from './WeathermapPanel';
import { SimpleOptions } from './types';
import { getData, theme } from './testData';
import { buildQueryOptions, handleVersionedStateUpdates } from './utils';

const timeRange = { from: dateTime(1000), to: dateTime(2000), raw: { from: 'now-1h', to: 'now' } };

// Two frames with different names, as with two datasources (#375): the full
// panel keeps the "Traffic" prefix, a Traffic-only subset would drop it.
const makeData = (): PanelData => ({
  state: LoadingState.Done,
  series: [
    toDataFrame({
      name: 'Traffic',
      fields: [
        { name: 'time', type: FieldType.time, values: [1000, 2000] },
        { name: 'value', type: FieldType.number, values: [5, 5], labels: { metric: 'router-a: 10104' } },
        { name: 'value', type: FieldType.number, values: [0, 1], labels: { metric: 'router-a: 10105' } },
      ],
    }),
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

const panelProps = (data: PanelData): PanelProps<SimpleOptions> => {
  const weathermap = handleVersionedStateUpdates(getData(theme), theme);
  // A and Z bound to different series, so the tooltip graphs two frames: with
  // a single frame Grafana caches the name as multipleFrames=false, and the
  // next full-series lookup recomputes it instead of reading the bad cache.
  weathermap.links.forEach((link) => {
    link.sides.A.query = 'Traffic value router-a: 10105';
    link.sides.Z.query = 'Traffic value router-a: 10104';
  });
  weathermap.nodes.forEach((node) => {
    node.statusQuery = 'Traffic value router-a: 10105';
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

const hoverAndLeave = () => {
  const link = screen.getAllByTestId('link')[0].firstChild!;
  fireEvent.mouseMove(link, { clientX: 100, clientY: 150 });
  const graphShown = document.querySelector('canvas') !== null;
  fireEvent.mouseLeave(link);
  return graphShown;
};

const nodeIsDown = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('rect')).some((r) => r.getAttribute('stroke') === '#ff0000');

test('the link tooltip graph still renders on a second hover (#375)', () => {
  render(<WeathermapPanel {...panelProps(makeData())} />);
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
