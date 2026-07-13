// Rail editor tests (#300, Phase 5): mode gating, entity CRUD with confirmed
// deletes, live report-only validation, and the import/export round trip.
import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { StandardEditorProps } from '@grafana/data';
import { Weathermap } from 'types';
import { getData, theme } from '../testData';
import { WeathermapBuilder } from './WeathermapBuilder';
import { RailForm } from './RailForm';
import { createDefaultRailConfig } from '../rail/defaults';
import { RailOperationsConfig } from '../rail/types';

const Harness = ({ initial, onChangeSpy }: { initial: Weathermap; onChangeSpy: jest.Mock }) => {
  const [wm, setWm] = useState(initial);
  const props = {
    value: wm,
    onChange: (v: Weathermap) => {
      onChangeSpy(v);
      setWm(v);
    },
    context: { data: [] },
    item: { settings: { placeholder: '' } },
  } as unknown as StandardEditorProps<Weathermap, { placeholder: string }>;
  return <RailForm {...props} />;
};

const lastValue = (spy: jest.Mock): Weathermap => spy.mock.calls[spy.mock.calls.length - 1][0];

const railWm = (railOverrides: Partial<RailOperationsConfig> = {}): Weathermap => {
  const wm = getData(theme);
  wm.mapMode = 'rail';
  wm.rail = {
    ...createDefaultRailConfig(),
    controlPoints: [
      { id: 'cp-a', type: 'station', position: [100, 100], label: 'Station A' },
      { id: 'cp-b', type: 'station', position: [400, 100], label: 'Station B' },
    ],
    trackSegments: [
      { id: 't1', fromControlPointId: 'cp-a', toControlPointId: 'cp-b', trackNumber: '1', direction: 'eastbound' },
    ],
    ...railOverrides,
  };
  return wm;
};

describe('rail editor gating (#300 Phase 5)', () => {
  const builderProps = (wm: Weathermap) =>
    ({
      value: wm,
      onChange: jest.fn(),
      context: { data: [] },
      item: { settings: { placeholder: '' } },
    } as unknown as StandardEditorProps<Weathermap, { placeholder: string }>);

  test('rail tools never render in network mode', () => {
    render(<WeathermapBuilder {...builderProps(getData(theme))} />);
    expect(screen.queryByTestId('nwm-rail-add-cp')).not.toBeInTheDocument();
  });

  test('rail tools render in rail mode', () => {
    render(<WeathermapBuilder {...builderProps(railWm())} />);
    expect(screen.getByTestId('nwm-rail-add-cp')).toBeInTheDocument();
  });
});

describe('rail editor CRUD', () => {
  test('adding a control point generates a fresh id and sensible defaults', () => {
    const spy = jest.fn();
    render(<Harness initial={railWm()} onChangeSpy={spy} />);
    fireEvent.click(screen.getByTestId('nwm-rail-add-cp'));
    const rail = lastValue(spy).rail!;
    expect(rail.controlPoints).toHaveLength(3);
    const added = rail.controlPoints[2];
    expect(added.id).toBeTruthy();
    expect(new Set(rail.controlPoints.map((cp) => cp.id)).size).toBe(3); // no duplicate ids possible
    expect(added.type).toBe('station');
    expect(Number.isFinite(added.position[0])).toBe(true);
  });

  test('deleting requires confirmation and never cascades', () => {
    const spy = jest.fn();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Harness initial={railWm()} onChangeSpy={spy} />);

    // Entity fields live inside a collapsed section; expand it first.
    fireEvent.click(screen.getByText('Station A (station)'));
    fireEvent.click(screen.getByTestId('nwm-rail-cp-delete-0'));
    expect(confirmSpy).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled(); // declined

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByTestId('nwm-rail-cp-delete-0'));
    const rail = lastValue(spy).rail!;
    expect(rail.controlPoints.map((cp) => cp.id)).toEqual(['cp-b']);
    // The segment referencing the deleted point is KEPT (report, not delete).
    expect(rail.trackSegments).toHaveLength(1);
    confirmSpy.mockRestore();
  });

  test('adding a segment defaults its endpoints to existing control points', () => {
    const spy = jest.fn();
    render(<Harness initial={railWm()} onChangeSpy={spy} />);
    fireEvent.click(screen.getByTestId('nwm-rail-add-segment'));
    const added = lastValue(spy).rail!.trackSegments[1];
    expect(added.fromControlPointId).toBe('cp-a');
    expect(added.toControlPointId).toBe('cp-b');
    expect(added.direction).toBe('bidirectional');
  });
});

describe('rail editor validation panel', () => {
  test('a clean topology reports no issues', () => {
    render(<Harness initial={railWm()} onChangeSpy={jest.fn()} />);
    expect(screen.getByTestId('nwm-rail-validation-ok')).toBeInTheDocument();
  });

  test('problems are reported live, never auto-deleted', () => {
    const wm = railWm({
      signals: [{ id: 's1', segmentId: 'ghost', positionPercent: 7, facingDirection: 'eastbound' }],
    });
    render(<Harness initial={wm} onChangeSpy={jest.fn()} />);
    const issues = screen.getByTestId('nwm-rail-validation-issues').textContent!;
    expect(issues).toContain('missing track segment');
    expect(issues).toContain('within 0..1');
  });
});

describe('rail JSON import/export', () => {
  test('import parses, confirms, normalizes, and replaces the configuration', () => {
    const spy = jest.fn();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Harness initial={railWm()} onChangeSpy={spy} />);

    const imported = {
      controlPoints: [{ id: 'new-cp', type: 'depot', position: [10, 20], label: 'Imported Depot' }],
      trackSegments: 'garbage', // normalization repairs this to []
    };
    fireEvent.change(screen.getByTestId('nwm-rail-import-text'), { target: { value: JSON.stringify(imported) } });
    fireEvent.click(screen.getByTestId('nwm-rail-import'));

    const rail = lastValue(spy).rail!;
    expect(rail.controlPoints.map((cp) => cp.id)).toEqual(['new-cp']);
    expect(rail.trackSegments).toEqual([]);
    expect(rail.layers.length).toBeGreaterThan(0); // defaults appended by normalization
    confirmSpy.mockRestore();
  });

  test('invalid JSON reports an error and changes nothing', () => {
    const spy = jest.fn();
    render(<Harness initial={railWm()} onChangeSpy={spy} />);
    fireEvent.change(screen.getByTestId('nwm-rail-import-text'), { target: { value: '{not json' } });
    fireEvent.click(screen.getByTestId('nwm-rail-import'));
    expect(screen.getByTestId('nwm-rail-import-error').textContent).toContain('Invalid JSON');
    expect(spy).not.toHaveBeenCalled();
  });

  test('export round-trips through import unchanged', () => {
    const spy = jest.fn();
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    const initial = railWm();
    render(<Harness initial={initial} onChangeSpy={spy} />);

    // Exported payload is exactly the current rail config JSON.
    const exported = JSON.stringify(initial.rail);
    fireEvent.change(screen.getByTestId('nwm-rail-import-text'), { target: { value: exported } });
    fireEvent.click(screen.getByTestId('nwm-rail-import'));

    expect(lastValue(spy).rail).toEqual(initial.rail);
    confirmSpy.mockRestore();
  });

  test('layer visibility toggles persist through the layer manager', () => {
    const spy = jest.fn();
    render(<Harness initial={railWm()} onChangeSpy={spy} />);
    fireEvent.click(screen.getByTestId('nwm-rail-layer-visible-rail-signals'));
    const layers = lastValue(spy).rail!.layers;
    expect(layers.find((l) => l.id === 'rail-signals')!.visible).toBe(false);
  });
});
