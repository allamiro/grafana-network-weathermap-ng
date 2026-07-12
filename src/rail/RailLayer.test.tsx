// Rail Operations rendering matrix (#300, Phase 2): tracks from ordered
// control-point + via geometry, independent parallel tracks, layer
// visibility/zoom gating, categorical states, tooltips, drill-downs, and the
// no-NaN SVG contract — all through the real panel, as a dashboard would.
import React from 'react';
import { getDefaultRelativeTimeRange, getTimeZone, LoadingState, PanelProps, toDataFrame } from '@grafana/data';
import { fireEvent, render, screen } from '@testing-library/react';
import { WeathermapPanel } from 'WeathermapPanel';
import { SimpleOptions, Weathermap } from 'types';
import { getData, theme } from 'testData';
import { createDefaultRailConfig, RAIL_LAYER_IDS } from './defaults';
import { RAIL_STATE_COLORS, RailOperationsConfig } from './types';

const railTopology = (): RailOperationsConfig => ({
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

const frame = (name: string, values: number[]) =>
  toDataFrame({
    refId: 'A',
    fields: [
      { name: 'Time', values: values.map((_, i) => i * 1000) },
      { name: 'Value', values, config: { displayNameFromDS: name } },
    ],
  });

const openSpy = jest.fn();

const renderRail = (mutate?: (wm: Weathermap) => void, series: unknown[] = []) => {
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
  return render(<WeathermapPanel {...props} />);
};

beforeEach(() => {
  openSpy.mockReset();
  window.open = openSpy;
});

const noNaNInSvg = (container: HTMLElement) => {
  for (const el of Array.from(container.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes ?? [])) {
      expect(attr.value.includes('NaN')).toBe(false);
      expect(attr.value.includes('Infinity')).toBe(false);
    }
  }
};

describe('rail rendering (#300 Phase 2)', () => {
  test('renders two independent physical tracks and both control points', () => {
    const { container } = renderRail();
    const tracks = screen.getAllByTestId('rail-track');
    expect(tracks).toHaveLength(2);
    expect(screen.getAllByTestId('rail-control-point')).toHaveLength(2);
    // Network link layers are replaced in rail mode.
    expect(screen.queryAllByTestId('link')).toHaveLength(0);
    noNaNInSvg(container);
  });

  test('track polylines follow the complete via geometry, not the endpoint chord', () => {
    renderRail();
    const t1 = screen.getAllByTestId('rail-track').find((el) => el.getAttribute('data-rail-id') === 't1')!;
    expect(t1.getAttribute('points')).toBe('100,100 250,60 400,100');
  });

  test('directional tracks get direction markers', () => {
    renderRail();
    expect(screen.getAllByTestId('rail-direction-marker').length).toBe(6); // 3 per directional track
  });

  test('bidirectional tracks render no direction markers', () => {
    renderRail((wm) => {
      wm.rail!.trackSegments = wm.rail!.trackSegments.map((s) => ({ ...s, direction: 'bidirectional' as const }));
    });
    expect(screen.queryAllByTestId('rail-direction-marker')).toHaveLength(0);
  });

  test('occupancy data drives categorical state color and dash pattern', () => {
    renderRail(undefined, [frame('TRACK 1 OCC', [1, 1, 1]), frame('TRACK 2 OCC', [0, 0, 0])]);
    const tracks = screen.getAllByTestId('rail-track');
    const t1 = tracks.find((el) => el.getAttribute('data-rail-id') === 't1')!;
    const t2 = tracks.find((el) => el.getAttribute('data-rail-id') === 't2')!;
    expect(t1.getAttribute('data-rail-state')).toBe('occupied');
    expect(t1.getAttribute('stroke')).toBe(RAIL_STATE_COLORS.occupied);
    expect(t2.getAttribute('data-rail-state')).toBe('clear');
  });

  test('a configured query with no matching series renders the distinct no_data style', () => {
    renderRail(); // no series at all
    const t1 = screen.getAllByTestId('rail-track').find((el) => el.getAttribute('data-rail-id') === 't1')!;
    expect(t1.getAttribute('data-rail-state')).toBe('no_data');
    expect(t1.getAttribute('stroke-dasharray')).not.toBeNull();
  });

  test('hidden tracks layer removes track elements entirely (no pointer events possible)', () => {
    renderRail((wm) => {
      wm.rail!.layers = wm.rail!.layers.map((l) => (l.id === RAIL_LAYER_IDS.tracks ? { ...l, visible: false } : l));
    });
    expect(screen.queryAllByTestId('rail-track')).toHaveLength(0);
    expect(screen.getAllByTestId('rail-control-point')).toHaveLength(2);
  });

  test('labels layer hides at low zoom via its maxZoom window', () => {
    renderRail((wm) => {
      wm.settings.panel.zoomScale = 3; // zoomed out 3 wheel steps
      wm.rail!.layers = wm.rail!.layers.map((l) => (l.id === RAIL_LAYER_IDS.labels ? { ...l, maxZoom: 2 } : l));
    });
    expect(screen.queryAllByTestId('rail-block-label')).toHaveLength(0);
    expect(screen.queryAllByTestId('rail-control-point-label')).toHaveLength(0);
    // Tracks themselves stay visible.
    expect(screen.getAllByTestId('rail-track')).toHaveLength(2);
  });

  test('block labels render when the labels layer is visible', () => {
    renderRail();
    expect(screen.getAllByTestId('rail-block-label').map((el) => el.textContent)).toEqual(
      expect.arrayContaining(['B01', 'B01W'])
    );
  });

  test('hovering a track shows the rail tooltip with categorical state', () => {
    renderRail(undefined, [frame('TRACK 1 OCC', [1, 1, 1])]);
    const t1 = screen.getAllByTestId('rail-track').find((el) => el.getAttribute('data-rail-id') === 't1')!;
    fireEvent.mouseMove(t1);
    const tooltip = screen.getByTestId('weathermap-rail-tooltip');
    expect(tooltip.textContent).toContain('Track 1');
    expect(tooltip.textContent).toContain('occupied');
    fireEvent.mouseOut(t1);
    expect(screen.queryByTestId('weathermap-rail-tooltip')).not.toBeInTheDocument();
  });

  test('control point drill-down opens only sanitized URLs', () => {
    renderRail();
    const cps = screen.getAllByTestId('rail-control-point');
    const stationA = cps.find((el) => el.getAttribute('data-rail-id') === 'cp-a')!;
    fireEvent.click(stationA);
    expect(openSpy).toHaveBeenCalledWith('/d/abc/station-a', '_blank', 'noopener,noreferrer');

    openSpy.mockReset();
  });

  test('a javascript: drill-down link never reaches window.open', () => {
    renderRail((wm) => {
      wm.rail!.controlPoints[0].dashboardLink = 'javascript:alert(1)';
    });
    const stationA = screen.getAllByTestId('rail-control-point').find((el) => el.getAttribute('data-rail-id') === 'cp-a')!;
    fireEvent.click(stationA);
    expect(openSpy).not.toHaveBeenCalled();
  });

  test('a segment referencing a deleted control point is skipped without crashing', () => {
    const { container } = renderRail((wm) => {
      wm.rail!.trackSegments.push({
        id: 'ghost-segment',
        fromControlPointId: 'cp-a',
        toControlPointId: 'deleted',
        trackNumber: '9',
        direction: 'eastbound',
      });
    });
    expect(screen.getAllByTestId('rail-track')).toHaveLength(2); // ghost skipped
    noNaNInSvg(container);
  });

  test('zero-length and non-finite geometry never emits NaN SVG attributes', () => {
    const { container } = renderRail((wm) => {
      wm.rail!.controlPoints.push({ id: 'cp-nan', type: 'station', position: [NaN, NaN], label: 'Broken' });
      wm.rail!.trackSegments.push(
        {
          id: 'zero',
          fromControlPointId: 'cp-a',
          toControlPointId: 'cp-a',
          trackNumber: '0',
          direction: 'eastbound',
        },
        {
          id: 'to-nan',
          fromControlPointId: 'cp-a',
          toControlPointId: 'cp-nan',
          trackNumber: '9',
          direction: 'eastbound',
          viaPoints: [[NaN, 5]],
        }
      );
    });
    noNaNInSvg(container);
  });

  test('network mode never renders rail layers, even with a rail config present', () => {
    renderRail((wm) => {
      delete wm.mapMode;
    });
    expect(screen.queryByTestId('rail-layer')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('link').length).toBeGreaterThan(0);
  });
});
