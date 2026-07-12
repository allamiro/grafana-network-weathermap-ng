// Backward-compatibility contract for Rail Operations mode (#300), Phase 1.
// Required behavior:
//   mapMode absent      -> network
//   rail config absent  -> feature off, no crash
//   old dashboards      -> unchanged (no mapMode/rail injected, no visual change)
//   network dashboards  -> never silently rewritten (needsMigration stays false)
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps } from '@grafana/data';
import { render, screen } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions, Weathermap } from 'types';
import { getData, legacyWeathermap, theme } from 'testData';
import { CURRENT_VERSION, handleVersionedStateUpdates, needsMigration } from 'utils';
import { normalizeMapMode } from './normalize';
import { createDefaultRailConfig } from './defaults';
import { RailOperationsConfig } from './types';

const renderPanel = (wm: Weathermap, onOptionsChange: (o: SimpleOptions) => void = () => {}) => {
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
  render(<WeathermapPanel {...props} />);
};

const railFixture = (): RailOperationsConfig => ({
  ...createDefaultRailConfig(),
  controlPoints: [
    { id: 'cp-a', type: 'station', position: [100, 350], label: 'Station A' },
    { id: 'cp-b', type: 'station', position: [400, 350], label: 'Station B' },
  ],
  trackSegments: [
    {
      id: 't1-b01',
      fromControlPointId: 'cp-a',
      toControlPointId: 'cp-b',
      trackNumber: '1',
      direction: 'eastbound',
      viaPoints: [[250, 300]],
    },
  ],
});

test('missing mapMode means network', () => {
  const wm = getData(theme);
  expect(wm.mapMode).toBeUndefined();
  expect(normalizeMapMode(wm.mapMode)).toBe('network');
});

test('rail mode without a rail config renders without crashing', () => {
  const wm = getData(theme);
  wm.mapMode = 'rail';
  expect(wm.rail).toBeUndefined();
  renderPanel(wm);
  expect(screen.getAllByTestId('link').length).toBeGreaterThan(0);
});

test('rail config present while mapMode is absent renders as network, unchanged', () => {
  const wm = getData(theme);
  wm.rail = railFixture();
  renderPanel(wm);
  expect(screen.getAllByTestId('link').length).toBeGreaterThan(0);
});

test('hostile rail JSON is normalized at the render choke point and never crashes', () => {
  const wm = getData(theme);
  wm.mapMode = 'rail';
  wm.rail = {
    controlPoints: 'garbage',
    trackSegments: [{ id: 't1', viaPoints: 'x' }, null, 42],
    layers: { not: 'an array' },
  } as unknown as Weathermap['rail'];
  renderPanel(wm);
  expect(screen.getAllByTestId('link').length).toBeGreaterThan(0);
});

test('old dashboards migrate without gaining mapMode or rail', () => {
  const migrated = handleVersionedStateUpdates(legacyWeathermap as unknown as Weathermap, theme);
  expect(migrated.version).toBe(CURRENT_VERSION);
  expect(migrated.mapMode).toBeUndefined();
  expect(migrated.rail).toBeUndefined();
  expect('mapMode' in migrated).toBe(false);
  expect('rail' in migrated).toBe(false);
});

test('current network dashboards are never silently rewritten', () => {
  // The raw fixture is deliberately version 1; a current-version map is the
  // migrated form (same convention as the #224 suite in utils.test.ts).
  const wm = handleVersionedStateUpdates(getData(theme), theme);
  expect(needsMigration(wm)).toBe(false);

  // The rail fields do not trip migration either: a rail map saved on this
  // version round-trips with no rewrite.
  const railWm = handleVersionedStateUpdates(getData(theme), theme);
  railWm.mapMode = 'rail';
  railWm.rail = railFixture();
  expect(needsMigration(railWm)).toBe(false);

  // Rendering a clean current-version map must not call onOptionsChange.
  const spy = jest.fn();
  renderPanel(wm, spy);
  expect(spy).not.toHaveBeenCalled();
});

test('rail configuration survives the defaults deep-merge unchanged', () => {
  const wm = getData(theme);
  wm.mapMode = 'rail';
  wm.rail = railFixture();
  // Force the migration path (as an old-version save would) and verify the
  // rail block passes through structurally intact.
  wm.version = CURRENT_VERSION - 1;
  const migrated = handleVersionedStateUpdates(wm, theme);
  expect(migrated.mapMode).toBe('rail');
  expect(migrated.rail).toEqual(railFixture());
});
