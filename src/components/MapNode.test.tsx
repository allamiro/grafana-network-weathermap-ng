// Regression tests for #178: pathological data frames must not crash the
// panel — MapNode status resolution filters frames by display name, which
// throws for frames without a value field.
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps, toDataFrame } from '@grafana/data';
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
