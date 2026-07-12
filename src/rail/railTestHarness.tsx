// Shared rail rendering test harness (not a test suite): renders the real
// WeathermapPanel in rail mode the way a dashboard would, so every rail suite
// exercises the full normalize -> resolve -> render pipeline.
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps, toDataFrame } from '@grafana/data';
import { render } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions, Weathermap } from 'types';
import { getData, theme } from 'testData';
import { createDefaultRailConfig } from './defaults';
import { RailOperationsConfig } from './types';

export const railTopology = (): RailOperationsConfig => ({
  ...createDefaultRailConfig(),
  controlPoints: [
    { id: 'cp-a', type: 'station', position: [100, 100], label: 'Station A', dashboardLink: '/d/abc/station-a' },
    { id: 'cp-b', type: 'junction', position: [400, 100], label: 'Junction B' },
  ],
  trackSegments: [
    {
      id: 't1',
      fromControlPointId: 'cp-a',
      toControlPointId: 'cp-b',
      trackNumber: '1',
      direction: 'eastbound',
      blockId: 'B01',
      occupancyQuery: 'TRACK 1 OCC',
      viaPoints: [[250, 60]],
    },
    {
      id: 't2',
      fromControlPointId: 'cp-b',
      toControlPointId: 'cp-a',
      trackNumber: '2',
      direction: 'westbound',
      blockId: 'B01W',
      occupancyQuery: 'TRACK 2 OCC',
    },
  ],
});

export const frame = (name: string, values: number[]) =>
  toDataFrame({
    refId: 'A',
    fields: [
      { name: 'Time', values: values.map((_, i) => i * 1000) },
      { name: 'Value', values, config: { displayNameFromDS: name } },
    ],
  });

export const renderRail = (mutate?: (wm: Weathermap) => void, series: unknown[] = []) => {
  const wm = getData(theme);
  wm.mapMode = 'rail';
  wm.rail = railTopology();
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
  return { ...render(<WeathermapPanel {...props} />), wm };
};

export const noNaNInSvg = (container: HTMLElement) => {
  for (const el of Array.from(container.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes ?? [])) {
      expect(attr.value.includes('NaN')).toBe(false);
      expect(attr.value.includes('Infinity')).toBe(false);
    }
  }
};
