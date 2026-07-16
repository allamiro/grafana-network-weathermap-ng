// Phase 3 signalling matrix (#300): signals, switches, crossovers, routes,
// and incident/maintenance overlays — read-only, categorical, and safe on
// dangling references. Rendered through the real panel via the shared
// harness.
import { fireEvent, screen } from '@testing-library/react';
import { RAIL_LAYER_IDS } from './defaults';
import { Weathermap } from 'types';
import { RAIL_STATE_COLORS, RailSignal, RailSwitch } from './types';
import { frame, noNaNInSvg, renderRail } from './railTestHarness';

const signal = (id: string, positionPercent: number, extra: Partial<RailSignal> = {}): RailSignal => ({
  id,
  segmentId: 't2', // straight track: cp-b [400,100] -> cp-a [100,100]
  positionPercent,
  facingDirection: 'westbound',
  stateQuery: `SIG ${id}`,
  ...extra,
});

// Junction topology for switches: t1 (cp-a->cp-b) and a branch t3 sharing cp-a.
const addBranch = (wm: Weathermap) => {
  wm.rail!.controlPoints.push({ id: 'cp-c', type: 'depot', position: [100, 300], label: 'Depot C' });
  wm.rail!.trackSegments.push({
    id: 't3',
    fromControlPointId: 'cp-a',
    toControlPointId: 'cp-c',
    trackNumber: '3',
    direction: 'bidirectional',
  });
};

const sw = (extra: Partial<RailSwitch> = {}): RailSwitch => ({
  id: 'p1',
  normalSegmentId: 't1',
  reverseSegmentId: 't3',
  positionQuery: 'SW POS',
  detectedQuery: 'SW DET',
  lockedQuery: 'SW LOCK',
  healthQuery: 'SW HEALTH',
  ...extra,
});

describe('signals (#300 Phase 3)', () => {
  test('placement at 0%, 50%, and 100% follows the segment geometry', () => {
    renderRail((wm) => {
      wm.rail!.signals = [signal('s0', 0), signal('s50', 0.5), signal('s100', 1)];
    });
    const poleX = (id: string) =>
      Number(
        screen
          .getAllByTestId('rail-signal')
          .find((el) => el.getAttribute('data-rail-id') === id)!
          .querySelector('line')!
          .getAttribute('x1')
      );
    expect(poleX('s0')).toBe(400);
    expect(poleX('s50')).toBe(250);
    expect(poleX('s100')).toBe(100);
  });

  test('non-finite positions are skipped; out-of-range positions clamp', () => {
    const { container } = renderRail((wm) => {
      wm.rail!.signals = [signal('bad', NaN), signal('over', 7)];
    });
    const rendered = screen.getAllByTestId('rail-signal').map((el) => el.getAttribute('data-rail-id'));
    expect(rendered).toEqual(['over']); // NaN skipped, 7 clamps to segment end
    noNaNInSvg(container);
  });

  test('aspect convention 0/1/2 maps to stop/caution/clear', () => {
    renderRail(
      (wm) => {
        wm.rail!.signals = [signal('s1', 0.2), signal('s2', 0.5), signal('s3', 0.8)];
      },
      [frame('SIG s1', [0, 0]), frame('SIG s2', [1, 1]), frame('SIG s3', [2, 2])]
    );
    const stateOf = (id: string) =>
      screen.getAllByTestId('rail-signal').find((el) => el.getAttribute('data-rail-id') === id)!.getAttribute('data-rail-state');
    expect(stateOf('s1')).toBe('stop');
    expect(stateOf('s2')).toBe('caution');
    expect(stateOf('s3')).toBe('clear');
  });

  test('a failed health query overrides the aspect and draws the ✕ mark', () => {
    renderRail(
      (wm) => {
        wm.rail!.signals = [signal('s1', 0.5, { healthQuery: 'SIG HEALTH' })];
      },
      [frame('SIG s1', [2, 2]), frame('SIG HEALTH', [0, 0])]
    );
    const el = screen.getByTestId('rail-signal');
    expect(el.getAttribute('data-rail-state')).toBe('failed');
    expect(screen.getByTestId('rail-signal-failed-mark')).toBeInTheDocument();
  });

  test('a signal with an unresolved query renders hollow no_data, never a live aspect', () => {
    renderRail((wm) => {
      wm.rail!.signals = [signal('s1', 0.5)];
    }); // no series
    const head = screen.getByTestId('rail-signal').querySelector('circle')!;
    expect(screen.getByTestId('rail-signal').getAttribute('data-rail-state')).toBe('no_data');
    expect(head.getAttribute('fill')).toBe('none');
    expect(head.getAttribute('stroke')).toBe(RAIL_STATE_COLORS.no_data);
  });

  test('a vanished aspect series is never masked by live-healthy machine health (review fix)', () => {
    renderRail(
      (wm) => {
        wm.rail!.signals = [signal('s1', 0.5, { healthQuery: 'SIG HEALTH' })];
      },
      [frame('SIG HEALTH', [1, 1])] // aspect series gone, health fine
    );
    const el = screen.getByTestId('rail-signal');
    expect(el.getAttribute('data-rail-state')).toBe('no_data');
    expect(el.querySelector('circle')!.getAttribute('fill')).toBe('none'); // hollow, not a confident head
  });

  test('signals layer visibility removes signals only', () => {
    renderRail((wm) => {
      wm.rail!.signals = [signal('s1', 0.5)];
      wm.rail!.layers = wm.rail!.layers.map((l) => (l.id === RAIL_LAYER_IDS.signals ? { ...l, visible: false } : l));
    });
    expect(screen.queryAllByTestId('rail-signal')).toHaveLength(0);
    expect(screen.getAllByTestId('rail-track').length).toBeGreaterThan(0);
  });
});

describe('switches (#300 Phase 3)', () => {
  test('normal position activates the normal leg; reverse activates the reverse leg', () => {
    renderRail(
      (wm) => {
        addBranch(wm);
        wm.rail!.switches = [sw()];
      },
      [frame('SW POS', [0, 0]), frame('SW DET', [1, 1])]
    );
    expect(screen.getByTestId('rail-switch').getAttribute('data-rail-position')).toBe('normal');
    expect(screen.getByTestId('rail-switch-leg-normal').getAttribute('data-rail-active')).toBe('true');
    expect(screen.getByTestId('rail-switch-leg-reverse').getAttribute('data-rail-active')).toBe('false');
  });

  test('reverse and moving positions resolve from the position convention', () => {
    renderRail(
      (wm) => {
        addBranch(wm);
        wm.rail!.switches = [sw()];
      },
      [frame('SW POS', [1, 1]), frame('SW DET', [1, 1])]
    );
    expect(screen.getByTestId('rail-switch').getAttribute('data-rail-position')).toBe('reverse');
    expect(screen.getByTestId('rail-switch-leg-reverse').getAttribute('data-rail-active')).toBe('true');
  });

  test('detection loss renders dashed legs and a caution state', () => {
    renderRail(
      (wm) => {
        addBranch(wm);
        wm.rail!.switches = [sw()];
      },
      [frame('SW POS', [0, 0]), frame('SW DET', [0, 0])]
    );
    expect(screen.getByTestId('rail-switch').getAttribute('data-rail-state')).toBe('caution');
    expect(screen.getByTestId('rail-switch-leg-normal').getAttribute('stroke-dasharray')).toBe('3 3');
  });

  test('locked switches show the lock outline; failed switches the ✕ mark', () => {
    renderRail(
      (wm) => {
        addBranch(wm);
        wm.rail!.switches = [sw()];
      },
      [frame('SW POS', [0, 0]), frame('SW DET', [1, 1]), frame('SW LOCK', [1, 1]), frame('SW HEALTH', [0, 0])]
    );
    expect(screen.getByTestId('rail-switch-lock')).toBeInTheDocument();
    expect(screen.getByTestId('rail-switch-failed-mark')).toBeInTheDocument();
    expect(screen.getByTestId('rail-switch').getAttribute('data-rail-state')).toBe('failed');
  });

  test('glyph and legs anchor to the SAME shared endpoint when paths share both ends (review fix)', () => {
    renderRail(
      (wm) => {
        // t1 (a->b) and t2 (b->a) share BOTH endpoints; anchor resolution
        // must use one id for the base circle AND both leg directions.
        wm.rail!.switches = [sw({ normalSegmentId: 't1', reverseSegmentId: 't2' })];
      },
      [frame('SW POS', [0, 0]), frame('SW DET', [1, 1])]
    );
    const base = screen.getByTestId('rail-switch').querySelector('circle')!;
    expect(base.getAttribute('cx')).toBe('100'); // cp-a
    expect(base.getAttribute('cy')).toBe('100');
    for (const legId of ['rail-switch-leg-normal', 'rail-switch-leg-reverse']) {
      const leg = screen.getByTestId(legId);
      expect(Number(leg.getAttribute('x1'))).toBe(100);
      // Both tracks leave cp-a to the right; legs must point along them,
      // never 180° away from the pointwork.
      expect(Number(leg.getAttribute('x2'))).toBeGreaterThan(100);
    }
  });

  test('a dangling controlPointId falls back to the shared endpoint for point AND legs (review fix)', () => {
    renderRail(
      (wm) => {
        addBranch(wm);
        wm.rail!.switches = [sw({ controlPointId: 'ghost' })];
      },
      [frame('SW POS', [0, 0]), frame('SW DET', [1, 1])]
    );
    const base = screen.getByTestId('rail-switch').querySelector('circle')!;
    expect(base.getAttribute('cx')).toBe('100'); // cp-a, shared by t1/t3
    const normalLeg = screen.getByTestId('rail-switch-leg-normal');
    expect(Number(normalLeg.getAttribute('x2'))).toBeGreaterThan(100); // along t1, away from cp-a
  });

  test('a missing position series cannot read as a confidently normal switch (review fix)', () => {
    renderRail(
      (wm) => {
        addBranch(wm);
        wm.rail!.switches = [sw()];
      },
      [frame('SW DET', [1, 1])] // position series vanished, detection live-healthy
    );
    expect(screen.getByTestId('rail-switch').getAttribute('data-rail-state')).toBe('no_data');
    expect(screen.getByTestId('rail-switch').getAttribute('data-rail-position')).toBe('unknown');
  });

  test('a switch with dangling segment references is skipped without crashing', () => {
    const { container } = renderRail((wm) => {
      wm.rail!.switches = [sw({ normalSegmentId: 'ghost', reverseSegmentId: 'ghost2', positionQuery: undefined })];
    });
    expect(screen.queryAllByTestId('rail-switch')).toHaveLength(0);
    noNaNInSvg(container);
  });
});

describe('crossovers (#300 Phase 3)', () => {
  test('single renders one connector, double and scissors render two', () => {
    const geometries: Array<['single' | 'double' | 'scissors', number]> = [
      ['single', 1],
      ['double', 2],
      ['scissors', 2],
    ];
    for (const [geometry, expected] of geometries) {
      const { unmount } = renderRail((wm) => {
        wm.rail!.crossovers = [{ id: 'x1', trackSegmentIds: ['t1', 't2'], geometry }];
      });
      expect(screen.getAllByTestId('rail-crossover-connector')).toHaveLength(expected);
      unmount();
    }
  });

  test('an unavailable crossover renders the blocked color, dashed', () => {
    renderRail(
      (wm) => {
        wm.rail!.crossovers = [{ id: 'x1', trackSegmentIds: ['t1', 't2'], geometry: 'single', stateQuery: 'XO AV' }];
      },
      [frame('XO AV', [0, 0])]
    );
    const connector = screen.getByTestId('rail-crossover-connector');
    expect(screen.getByTestId('rail-crossover').getAttribute('data-rail-state')).toBe('blocked');
    expect(connector.getAttribute('stroke')).toBe(RAIL_STATE_COLORS.blocked);
    expect(connector.getAttribute('stroke-dasharray')).toBe('6 4');
  });

  test('a crossover with a missing segment is skipped', () => {
    renderRail((wm) => {
      wm.rail!.crossovers = [{ id: 'x1', trackSegmentIds: ['t1', 'ghost'], geometry: 'single' }];
    });
    expect(screen.queryAllByTestId('rail-crossover')).toHaveLength(0);
  });
});

describe('routes and incident overlays (#300 Phase 3)', () => {
  test('an established route washes its covered segments; a torn-down route renders nothing', () => {
    renderRail(
      (wm) => {
        wm.rail!.routes = [
          { id: 'r-live', segmentIds: ['t1'], stateQuery: 'ROUTE LIVE' },
          { id: 'r-down', segmentIds: ['t2'], stateQuery: 'ROUTE DOWN' },
          { id: 'r-gone', segmentIds: ['t2'], stateQuery: 'ROUTE GONE' }, // no series
        ];
      },
      [frame('ROUTE LIVE', [1, 1]), frame('ROUTE DOWN', [0, 0])]
    );
    const routes = screen.getAllByTestId('rail-route').map((el) => el.getAttribute('data-rail-id'));
    expect(routes).toEqual(['r-live']);
  });

  test('routes referencing only missing segments render nothing', () => {
    renderRail((wm) => {
      wm.rail!.routes = [{ id: 'r1', segmentIds: ['ghost'] }];
    });
    expect(screen.queryAllByTestId('rail-route')).toHaveLength(0);
  });

  test('maintenance and incident overlays render dashed washes with letter badges', () => {
    renderRail((wm) => {
      wm.rail!.incidents = [
        { id: 'm1', kind: 'maintenance', segmentIds: ['t1'] },
        { id: 'i1', kind: 'incident', segmentIds: ['t2'] },
      ];
    });
    const badges = screen.getAllByTestId('rail-incident-badge').map((el) => el.textContent);
    expect(badges).toEqual(expect.arrayContaining(['M', 'I']));
    const m1 = screen.getAllByTestId('rail-incident').find((el) => el.getAttribute('data-rail-id') === 'm1')!;
    expect(m1.querySelector('polyline')!.getAttribute('stroke')).toBe(RAIL_STATE_COLORS.maintenance);
  });

  test('overlays paint above the tracks layer (canonical layer order)', () => {
    const { container } = renderRail((wm) => {
      wm.rail!.incidents = [{ id: 'm1', kind: 'maintenance', segmentIds: ['t1'] }];
    });
    const layer = container.querySelector('[data-testid="rail-layer"]')!;
    const order = Array.from(layer.querySelectorAll('[data-testid$="-layer"]')).map((el) =>
      el.getAttribute('data-testid')
    );
    expect(order.indexOf('rail-incidents-layer')).toBeGreaterThan(order.indexOf('rail-tracks-layer'));
    expect(order.indexOf('rail-control-points-layer')).toBeGreaterThan(order.indexOf('rail-incidents-layer'));
  });

  test('hovering phase-3 elements shows categorical tooltips', () => {
    renderRail(
      (wm) => {
        addBranch(wm);
        wm.rail!.signals = [signal('s1', 0.5)];
        wm.rail!.switches = [sw()];
      },
      [frame('SIG s1', [0, 0]), frame('SW POS', [1, 1]), frame('SW DET', [0, 0])]
    );
    fireEvent.mouseMove(screen.getByTestId('rail-signal'));
    expect(screen.getByTestId('weathermap-rail-tooltip').textContent).toContain('stop');
    fireEvent.mouseMove(screen.getByTestId('rail-switch'));
    const tooltip = screen.getByTestId('weathermap-rail-tooltip').textContent!;
    expect(tooltip).toContain('reverse');
    expect(tooltip).toContain('NO');
  });
});

describe('cross-mode tooltip lifecycle (#300 review fix)', () => {
  // Known limitation: an element unmounting under a STATIONARY pointer (e.g.
  // a route wash deactivating on data refresh) keeps its tooltip until the
  // pointer moves off the SVG or over another hover target — clearing on
  // every data refresh would kill tooltips mid-read, which is worse.
  test('the svg-leave handler clears a rail tooltip whose target vanished', () => {
    const { rerender: _r } = renderRail(undefined, [frame('TRACK 1 OCC', [1, 1])]);
    const t1 = screen.getAllByTestId('rail-track').find((el) => el.getAttribute('data-rail-id') === 't1')!;
    fireEvent.mouseMove(t1);
    expect(screen.getByTestId('weathermap-rail-tooltip')).toBeInTheDocument();
    // Pointer leaves the SVG entirely (e.g. element unmounted under it).
    fireEvent.mouseLeave(t1.ownerDocument.querySelector('svg')!);
    expect(screen.queryByTestId('weathermap-rail-tooltip')).not.toBeInTheDocument();
  });
});
