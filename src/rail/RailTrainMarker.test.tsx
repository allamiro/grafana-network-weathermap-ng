// Phase 4 train marker matrix (#300): individually identified trains placed
// by segment + normalized progress along the complete polyline. Rendered
// through the real panel via the shared harness.
import { fireEvent, screen } from '@testing-library/react';
import { RAIL_LAYER_IDS } from './defaults';
import { RailTrainMarker } from './types';
import { resolveTrainTelemetry } from './queries';
import { frame, noNaNInSvg, renderRail } from './railTestHarness';

const train = (id: string, extra: Partial<RailTrainMarker> = {}): RailTrainMarker => ({
  id,
  segmentId: 't2', // straight: cp-b [400,100] -> cp-a [100,100]
  ...extra,
});

const markerOf = (id: string) =>
  screen.getAllByTestId('rail-train').find((el) => el.getAttribute('data-rail-id') === id)!;

const transformOf = (el: Element) => (el as HTMLElement).style.transform;
const translateX = (el: Element) => {
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(transformOf(el));
  return m ? Number(m[1]) : NaN;
};

describe('train placement (#300 Phase 4)', () => {
  test('0/25/50/75/100% land on the straight segment geometry', () => {
    renderRail((wm) => {
      wm.rail!.trains = [0, 0.25, 0.5, 0.75, 1].map((p, i) => train(`rd-${i}`, { progress: p }));
    });
    // t2 runs 400 -> 100 on x.
    expect([0, 1, 2, 3, 4].map((i) => translateX(markerOf(`rd-${i}`)))).toEqual([400, 325, 250, 175, 100]);
  });

  test('curved (via) paths place the train on the full polyline, not the chord', () => {
    renderRail((wm) => {
      // t1: [100,100] -> via [250,60] -> [400,100]
      wm.rail!.trains = [train('rd-v', { segmentId: 't1', progress: 0.5 })];
    });
    // Halfway along the two equal-length legs = exactly the via point.
    expect(transformOf(markerOf('rd-v'))).toContain('translate(250px, 60px)');
  });

  test('progress from a query is clamped; out-of-range static progress clamps too', () => {
    renderRail(
      (wm) => {
        wm.rail!.trains = [train('rd-q', { progressQuery: 'TRAIN RD-Q PROG' }), train('rd-over', { progress: 42 })];
      },
      [frame('TRAIN RD-Q PROG', [1.7, 1.7])]
    );
    expect(translateX(markerOf('rd-q'))).toBe(100); // clamped to 1 -> end of t2
    expect(translateX(markerOf('rd-over'))).toBe(100);
  });

  test('data-driven segment binding: series name suffix carries the segment id', () => {
    renderRail(
      (wm) => {
        wm.rail!.trains = [train('rd-218', { segmentId: undefined, segmentQuery: 'TRAIN RD-218' })];
      },
      [frame('TRAIN RD-218 t1', [0.5, 0.5])]
    );
    const marker = markerOf('rd-218');
    expect(marker.getAttribute('data-rail-segment')).toBe('t1');
    expect(transformOf(marker)).toContain('translate(250px, 60px)');
  });

  test('a train on a missing or deleted segment renders nothing, never crashes', () => {
    const { container } = renderRail((wm) => {
      wm.rail!.trains = [train('rd-ghost', { segmentId: 'deleted', progress: 0.5 })];
    });
    expect(screen.queryAllByTestId('rail-train')).toHaveLength(0);
    noNaNInSvg(container);
  });

  test('a configured position query that resolves nothing renders no confidently-placed train', () => {
    renderRail((wm) => {
      wm.rail!.trains = [train('rd-lost', { segmentQuery: 'TRAIN RD-LOST' })];
    }); // no series at all
    expect(screen.queryAllByTestId('rail-train')).toHaveLength(0);
  });

  test('stale telemetry dims the marker and dashes its outline', () => {
    renderRail(
      (wm) => {
        wm.rail!.trains = [train('rd-s', { progress: 0.5, staleQuery: 'RD-S STALE' })];
      },
      [frame('RD-S STALE', [1, 1])]
    );
    const marker = markerOf('rd-s');
    expect(marker.getAttribute('data-rail-state')).toBe('stale');
    expect(marker.getAttribute('opacity')).toBe('0.55');
    expect(marker.querySelector('rect')!.getAttribute('stroke-dasharray')).toBe('3 2');
  });

  test('two trains share one segment independently', () => {
    renderRail((wm) => {
      wm.rail!.trains = [train('rd-1', { progress: 0.25 }), train('rd-2', { progress: 0.75 })];
    });
    expect(translateX(markerOf('rd-1'))).toBe(325);
    expect(translateX(markerOf('rd-2'))).toBe(175);
  });

  test('markers rotate to the track tangent unless rotation is disabled', () => {
    renderRail((wm) => {
      wm.rail!.trains = [
        train('rd-rot', { segmentId: 't1', progress: 0.25 }), // climbing leg of the via path
        train('rd-flat', { segmentId: 't1', progress: 0.25, rotate: false }),
      ];
    });
    const rotated = /rotate\((-?[\d.]+)deg\)/.exec(transformOf(markerOf('rd-rot')))![1];
    expect(Number(rotated)).not.toBe(0);
    expect(transformOf(markerOf('rd-flat'))).toContain('rotate(0deg)');
  });

  test('smooth motion is off without the animation master switch (and in edit mode)', () => {
    renderRail((wm) => {
      wm.rail!.trains = [train('rd-m', { progress: 0.5 })];
    });
    expect(markerOf('rd-m').style.transition).toBe('');
  });

  test('smooth motion engages with animation enabled, capped by maxAnimatedLinks (topmost trains first)', () => {
    renderRail((wm) => {
      wm.settings.animation = { enabled: true, respectReducedMotion: false, pauseInEditMode: false, maxAnimatedLinks: 1 };
      wm.rail!.trains = [train('rd-a', { progress: 0.25 }), train('rd-b', { progress: 0.75, zIndex: 5 })];
    });
    // The cap budget goes to the HIGHEST-zIndex (most prominent) trains.
    expect(markerOf('rd-b').style.transition).toContain('transform');
    expect(markerOf('rd-a').style.transition).toBe('');
  });

  test('trains layer visibility and label gating', () => {
    renderRail((wm) => {
      wm.rail!.trains = [train('rd-l', { progress: 0.5, label: 'RD 218' })];
    });
    expect(screen.getByTestId('rail-train-label').textContent).toBe('RD 218');

    const { container } = renderRail((wm) => {
      wm.rail!.trains = [train('rd-h', { progress: 0.5 })];
      wm.rail!.layers = wm.rail!.layers.map((l) => (l.id === RAIL_LAYER_IDS.trains ? { ...l, visible: false } : l));
    });
    expect(container.querySelectorAll('[data-testid="rail-train"]')).toHaveLength(0);
  });

  test('train tooltip carries segment, progress, speed, delay, and state', () => {
    renderRail(
      (wm) => {
        wm.rail!.trains = [
          train('rd-t', { progress: 0.5, label: 'RD 218', speedQuery: 'RD-T SPEED', delayQuery: 'RD-T DELAY' }),
        ];
      },
      [frame('RD-T SPEED', [47, 47]), frame('RD-T DELAY', [120, 120])]
    );
    fireEvent.mouseMove(markerOf('rd-t'));
    const tooltip = screen.getByTestId('weathermap-rail-tooltip').textContent!;
    expect(tooltip).toContain('RD 218');
    expect(tooltip).toContain('t2 (50%)');
    expect(tooltip).toContain('47 km/h');
    expect(tooltip).toContain('120s');
  });
});

describe('resolveTrainTelemetry unit behavior', () => {
  const frames = (entries: Record<string, number>) => new Map(Object.entries(entries));

  test('prefix scan wins over static config; first match wins on duplicates', () => {
    const t = resolveTrainTelemetry(
      { segmentId: 'static-seg', progress: 0.1, segmentQuery: 'TRAIN X' },
      frames({ 'TRAIN X b-2': 0.7, 'TRAIN X a-1': 0.3 })
    );
    // Map preserves insertion order: first inserted key wins.
    expect(t.segmentId).toBe('b-2');
    expect(t.progress).toBe(0.7);
    expect(t.stale).toBe(false);
  });

  test('with timestamps, the scan binds the FRESHEST matching series, not the first (live-data fix)', () => {
    // Range queries keep the block a train already left in the result for the
    // whole time range; the older series appears FIRST. Without freshness the
    // marker would freeze at the end of that old block.
    const t = resolveTrainTelemetry(
      { segmentQuery: 'TRAIN RD-218' },
      frames({ 'TRAIN RD-218 t1-b01': 0.99, 'TRAIN RD-218 t1-b02': 0.31 }),
      new Set(['t1-b01', 't1-b02']),
      new Map([
        ['TRAIN RD-218 t1-b01', 1000], // stale series: train left this block
        ['TRAIN RD-218 t1-b02', 5000], // live series
      ])
    );
    expect(t.segmentId).toBe('t1-b02');
    expect(t.progress).toBe(0.31);
    expect(t.stale).toBe(false);
  });

  test('the scan never captures an extending train name when segment ids are known (review fix)', () => {
    const t = resolveTrainTelemetry(
      { segmentQuery: 'TRAIN A' },
      frames({ 'TRAIN A EXPRESS t1': 0.9, 'TRAIN A t2': 0.4 }),
      new Set(['t1', 't2'])
    );
    // 'EXPRESS t1' is not a known segment; the scan must skip it and find t2.
    expect(t.segmentId).toBe('t2');
    expect(t.progress).toBe(0.4);
  });

  test('a vanished data-driven binding reads stale even when an authored fallback places it (review fix)', () => {
    const t = resolveTrainTelemetry(
      { segmentQuery: 'TRAIN GONE', segmentId: 't1', progress: 0.1 },
      frames({})
    );
    expect(t.segmentId).toBe('t1'); // fallback placement still renders...
    expect(t.progress).toBe(0.1);
    expect(t.stale).toBe(true); // ...but never as fresh live telemetry.
    expect(t.state.state).toBe('stale');
  });

  test('a live failed status is never repainted by the stale wash (review fix)', () => {
    const t = resolveTrainTelemetry(
      { segmentId: 't1', progress: 0.5, statusQuery: 'ST', staleQuery: 'AGE' },
      frames({ ST: 0, AGE: 1 })
    );
    expect(t.stale).toBe(true);
    expect(t.state.state).toBe('failed'); // severity doctrine: alarms beat stale
  });

  test('explicit stale flag and vanished position series both mark stale', () => {
    expect(resolveTrainTelemetry({ segmentId: 's', progress: 0.5, staleQuery: 'ST' }, frames({ ST: 1 })).stale).toBe(true);
    const vanished = resolveTrainTelemetry({ segmentQuery: 'TRAIN GONE' }, frames({}));
    expect(vanished.stale).toBe(true);
    expect(vanished.progress).toBeUndefined();
  });

  test('non-finite telemetry values resolve to undefined, never NaN', () => {
    const t = resolveTrainTelemetry(
      { segmentId: 's', progressQuery: 'P', speedQuery: 'V' },
      frames({ P: NaN, V: Infinity })
    );
    expect(t.progress).toBeUndefined();
    expect(t.speed).toBeUndefined();
  });
});
