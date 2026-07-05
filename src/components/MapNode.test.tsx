// Regression tests for #178: pathological data frames must not crash the
// panel — MapNode status resolution filters frames by display name, which
// throws for frames without a value field.
import React from 'react';
import { FieldType, getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps, toDataFrame } from '@grafana/data';
import { render, screen } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions } from 'types';
import { getData, theme } from 'testData';

const baseProps = (series: unknown[]) =>
  ({
    id: 1,
    data: { state: LoadingState.Done, series, timeRange: getDefaultRelativeTimeRange() },
    timeRange: getDefaultRelativeTimeRange(),
    timeZone: getTimeZone(),
    options: { weathermap: (() => { const wm = getData(theme); wm.nodes.forEach((n) => (n.statusQuery = 'STATUS X')); return wm; })() },
    transparent: false,
    width: 600,
    height: 400,
    fieldConfig: {},
    renderCounter: 1,
    title: 'T',
    eventBus: {},
    onOptionsChange: () => {},
  } as unknown as PanelProps<SimpleOptions>);

test('empty frame (no fields, no name) does not crash the panel', () => {
  const empty = toDataFrame({ fields: [] });
  render(<WeathermapPanel {...baseProps([empty])} />);
  expect(screen.getAllByTestId('link').length).toBeGreaterThan(0);
});

test('frame with a single non-numeric field does not crash the panel', () => {
  const weird = toDataFrame({ name: undefined, fields: [{ name: 'label', values: ['a', 'b'] }] });
  render(<WeathermapPanel {...baseProps([weird])} />);
  expect(screen.getAllByTestId('link').length).toBeGreaterThan(0);
});


// Regression tests for #260: node status must resolve when the bound series
// is a non-first value field of a wide frame (Zabbix data alignment, join
// transformations, SQL wide mode).
const widePropsWithStatusDown = (series: unknown[]) => {
  const props = baseProps(series);
  const wm = (props.options as { weathermap: ReturnType<typeof getData> }).weathermap;
  wm.nodes.forEach((n) => (n.colors.statusDown = '#ff0000'));
  return props;
};

const wideStatusFrame = (statusValues: number[]) =>
  toDataFrame({
    fields: [
      { name: 'Time', type: FieldType.time, values: [1000, 2000] },
      { name: 'wm_link_bps', type: FieldType.number, values: [5, 5] },
      { name: 'STATUS X', type: FieldType.number, values: statusValues },
    ],
  });

test('wide frame: status bound to a non-first value field resolves as up (#260)', () => {
  // Before #260 the STATUS X field was invisible (only the first value field
  // was bound), so the node fell back to the down color despite live data.
  const { container } = render(<WeathermapPanel {...widePropsWithStatusDown([wideStatusFrame([1, 1])])} />);
  const strokes = Array.from(container.querySelectorAll('rect')).map((r) => r.getAttribute('stroke'));
  expect(strokes).not.toContain('#ff0000');
});

test('wide frame: status bound to a non-first value field resolves as down (#260)', () => {
  const { container } = render(<WeathermapPanel {...widePropsWithStatusDown([wideStatusFrame([1, 0])])} />);
  const strokes = Array.from(container.querySelectorAll('rect')).map((r) => r.getAttribute('stroke'));
  expect(strokes).toContain('#ff0000');
});
