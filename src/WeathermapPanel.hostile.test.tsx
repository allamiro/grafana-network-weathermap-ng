// Hostile-data render matrix: shapes that have crashed the panel in the wild
// (#178 was one instance) or can appear via hand-edited/provisioned
// dashboards. The panel must render — degraded, never thrown.
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps, toDataFrame } from '@grafana/data';
import { render, screen } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions, Weathermap } from 'types';
import { getData, theme } from 'testData';

const renderPanel = (series: unknown[], mutate?: (wm: Weathermap) => void) => {
  const wm = getData(theme);
  wm.links[0].sides.A.query = 'A QUERY';
  wm.links[0].sides.Z.query = 'Z QUERY';
  wm.nodes.forEach((n) => (n.statusQuery = 'STATUS X'));
  if (mutate) {
    mutate(wm);
  }
  const props = {
    id: 1,
    data: { state: LoadingState.Done, series, timeRange: getDefaultRelativeTimeRange() },
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
    onOptionsChange: () => {},
  } as unknown as PanelProps<SimpleOptions>;
  render(<WeathermapPanel {...props} />);
};

const expectRendered = () => expect(screen.getAllByTestId('link').length).toBeGreaterThan(0);

const goodFrame = (name: string, values: number[] = [1, 2, 3]) =>
  toDataFrame({
    refId: 'A',
    fields: [
      { name: 'Time', values: values.map((_, i) => i * 1000) },
      { name: 'Value', values, config: { displayNameFromDS: name } },
    ],
  });

test('frame with a time field but no value field', () => {
  renderPanel([toDataFrame({ fields: [{ name: 'Time', values: [1, 2, 3] }] })]);
  expectRendered();
});

test('frame with all-NaN values', () => {
  renderPanel([goodFrame('A QUERY', [NaN, NaN, NaN] as unknown as number[])]);
  expectRendered();
});

test('frames with duplicate display names', () => {
  renderPanel([goodFrame('A QUERY'), goodFrame('A QUERY'), goodFrame('Z QUERY')]);
  expectRendered();
});

test('value field without a time field', () => {
  renderPanel([
    toDataFrame({
      refId: 'A',
      fields: [{ name: 'Value', values: [5, 6], config: { displayNameFromDS: 'A QUERY' } }],
    }),
  ]);
  expectRendered();
});

test('link whose queries match no frame', () => {
  renderPanel([goodFrame('SOMETHING ELSE ENTIRELY')]);
  expectRendered();
});

test('zero and negative panel-ish values', () => {
  renderPanel([goodFrame('A QUERY', [0, -100, 0])]);
  expectRendered();
});

test('node icon pointing at a nonexistent bundled icon still renders', () => {
  renderPanel([goodFrame('A QUERY')], (wm) => {
    wm.nodes[0].nodeIcon = {
      src: 'public/plugins/tamirsuliman-weathermap-panel/icons/networking/does-not-exist.svg',
      name: 'networking/does-not-exist',
      size: { width: 40, height: 40 },
      padding: { vertical: 0, horizontal: 0 },
      drawInside: false,
    };
  });
  expectRendered();
});

test('scale with a single threshold and out-of-range utilization', () => {
  renderPanel([goodFrame('A QUERY', [10_000_000_000])], (wm) => {
    wm.scale = [{ percent: 0, color: '#00ff00' }];
    wm.links[0].sides.A.bandwidth = 1; // utilization far above 100%
  });
  expectRendered();
});

test('connection node with fewer than two links (corrupt VIA) does not crash', () => {
  renderPanel([goodFrame('A QUERY')], (wm) => {
    wm.nodes.push({
      ...JSON.parse(JSON.stringify(wm.nodes[0])),
      id: 'dangling-via',
      label: 'C0',
      isConnection: true,
    });
  });
  expectRendered();
});
