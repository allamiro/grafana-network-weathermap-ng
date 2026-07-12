import { createDefaultRailConfig } from './defaults';
import { normalizeRailConfig } from './normalize';
import { validateRailTopology } from './validation';
import { RailControlPoint, RailOperationsConfig, RailTrackSegment } from './types';

const cp = (id: string, x = 0, y = 0): RailControlPoint => ({
  id,
  type: 'station',
  position: [x, y],
  label: id.toUpperCase(),
});

const seg = (id: string, from: string, to: string, extra: Partial<RailTrackSegment> = {}): RailTrackSegment => ({
  id,
  fromControlPointId: from,
  toControlPointId: to,
  trackNumber: '1',
  direction: 'eastbound',
  ...extra,
});

const base = (overrides: Partial<RailOperationsConfig> = {}): RailOperationsConfig => ({
  ...createDefaultRailConfig(),
  controlPoints: [cp('a', 0, 0), cp('b', 100, 0)],
  trackSegments: [seg('t1', 'a', 'b')],
  ...overrides,
});

const codes = (config: RailOperationsConfig) => validateRailTopology(config).map((i) => i.code);

describe('validateRailTopology', () => {
  it('accepts a minimal valid topology', () => {
    expect(validateRailTopology(base())).toEqual([]);
  });

  it('never throws, even on a hostile normalized config', () => {
    const hostile = normalizeRailConfig({
      controlPoints: [{ label: 'no id' }],
      trackSegments: [{ id: 't', viaPoints: [[NaN, NaN]] }],
      signals: [{ id: 's', positionPercent: 7 }],
      trains: [{ id: 'x', segmentId: 'ghost', progress: -2 }],
      crossovers: [{ id: 'c' }],
      routes: [{ id: 'r', segmentIds: ['ghost'] }],
    });
    expect(() => validateRailTopology(hostile)).not.toThrow();
    expect(validateRailTopology(hostile).length).toBeGreaterThan(0);
  });

  it('reports missing and duplicate ids', () => {
    const result = validateRailTopology(
      base({ controlPoints: [cp('a'), cp('a'), { ...cp('c'), id: '' }], trackSegments: [] })
    );
    expect(result).toContainEqual(expect.objectContaining({ code: 'duplicate-id', entityId: 'a', severity: 'error' }));
    expect(result).toContainEqual(expect.objectContaining({ code: 'missing-id', entityType: 'controlPoint' }));
  });

  it('reports segments referencing missing control points', () => {
    expect(codes(base({ trackSegments: [seg('t1', 'a', 'ghost')] }))).toContain('missing-control-point');
  });

  it('reports zero-length segments but allows same-endpoint loops with via points', () => {
    expect(codes(base({ trackSegments: [seg('loop', 'a', 'a')] }))).toContain('zero-length-segment');
    expect(codes(base({ trackSegments: [seg('loop', 'a', 'a', { viaPoints: [[50, 50]] })] }))).not.toContain(
      'zero-length-segment'
    );
  });

  it('reports non-finite coordinates on control points and via points', () => {
    expect(codes(base({ controlPoints: [cp('a'), { ...cp('b'), position: [NaN, 0] }] }))).toContain(
      'non-finite-position'
    );
    expect(codes(base({ trackSegments: [seg('t1', 'a', 'b', { viaPoints: [[Infinity, 2]] })] }))).toContain(
      'non-finite-via-point'
    );
  });

  it('warns on duplicate block/track identity between the same endpoints', () => {
    const result = validateRailTopology(
      base({
        trackSegments: [
          seg('t1', 'a', 'b', { blockId: 'B01' }),
          seg('t1-copy', 'b', 'a', { blockId: 'B01' }), // same endpoints either direction
        ],
      })
    );
    expect(result).toContainEqual(expect.objectContaining({ code: 'duplicate-track-identity', severity: 'warning' }));
  });

  it('does not confuse identities whose free-form fields contain delimiter characters', () => {
    // blockId 'B|1' + track '2' vs blockId 'B' + track '1|2' are DISTINCT
    // identities; a string-concatenated grouping key would collide them.
    const result = validateRailTopology(
      base({
        trackSegments: [
          seg('t1', 'a', 'b', { blockId: 'B|1', trackNumber: '2' }),
          seg('t2', 'a', 'b', { blockId: 'B', trackNumber: '1|2' }),
        ],
      })
    );
    expect(result.filter((i) => i.code === 'duplicate-track-identity')).toEqual([]);
  });

  it('never throws even when handed raw un-normalized saved JSON', () => {
    const raw = {
      controlPoints: 'garbage',
      trackSegments: [{ id: 't' }],
      crossovers: [{ id: 'c' }], // no trackSegmentIds at all
      layers: null,
    } as unknown as RailOperationsConfig;
    expect(() => validateRailTopology(raw)).not.toThrow();
    expect(validateRailTopology(raw).length).toBeGreaterThan(0);
  });

  it('reports signals with missing segments or out-of-range positions', () => {
    const result = validateRailTopology(
      base({
        signals: [
          { id: 's1', segmentId: 'ghost', positionPercent: 0.5, facingDirection: 'eastbound' },
          { id: 's2', segmentId: 't1', positionPercent: 1.5, facingDirection: 'eastbound' },
          { id: 's3', segmentId: 't1', positionPercent: NaN, facingDirection: 'eastbound' },
          { id: 's4', segmentId: 't1', positionPercent: 0, facingDirection: 'eastbound' },
          { id: 's5', segmentId: 't1', positionPercent: 1, facingDirection: 'eastbound' },
        ],
      })
    );
    expect(result).toContainEqual(expect.objectContaining({ code: 'missing-segment', entityId: 's1' }));
    expect(result).toContainEqual(expect.objectContaining({ code: 'position-out-of-range', entityId: 's2' }));
    expect(result).toContainEqual(expect.objectContaining({ code: 'position-out-of-range', entityId: 's3' }));
    expect(result.filter((i) => i.entityId === 's4' || i.entityId === 's5')).toEqual([]);
  });

  it('reports switch reference problems', () => {
    const result = validateRailTopology(
      base({
        trackSegments: [seg('t1', 'a', 'b'), seg('t2', 'a', 'b', { trackNumber: '2' })],
        switches: [
          { id: 'p1', normalSegmentId: 't1', reverseSegmentId: 't1' },
          { id: 'p2', normalSegmentId: 'ghost', reverseSegmentId: 't2', controlPointId: 'nowhere' },
        ],
      })
    );
    expect(result).toContainEqual(expect.objectContaining({ code: 'identical-paths', entityId: 'p1' }));
    expect(result).toContainEqual(expect.objectContaining({ code: 'missing-segment', entityId: 'p2' }));
    expect(result).toContainEqual(
      expect.objectContaining({ code: 'missing-control-point', entityId: 'p2', severity: 'warning' })
    );
  });

  it('reports crossovers with insufficient or missing segments', () => {
    const result = validateRailTopology(
      base({
        crossovers: [
          { id: 'x1', trackSegmentIds: ['t1'], geometry: 'single' },
          { id: 'x2', trackSegmentIds: ['t1', 'ghost'], geometry: 'double' },
        ],
      })
    );
    expect(result).toContainEqual(expect.objectContaining({ code: 'insufficient-segments', entityId: 'x1' }));
    expect(result).toContainEqual(expect.objectContaining({ code: 'missing-segment', entityId: 'x2' }));
  });

  it('reports train reference and progress problems only for static fields', () => {
    const result = validateRailTopology(
      base({
        trains: [
          { id: 'rd-1', segmentId: 'ghost' },
          { id: 'rd-2', segmentId: 't1', progress: 1.2 },
          { id: 'rd-3', segmentQuery: 'train segment', progressQuery: 'train progress' }, // query-driven: fine
        ],
      })
    );
    expect(result).toContainEqual(expect.objectContaining({ code: 'missing-segment', entityId: 'rd-1' }));
    expect(result).toContainEqual(expect.objectContaining({ code: 'progress-out-of-range', entityId: 'rd-2' }));
    expect(result.filter((i) => i.entityId === 'rd-3')).toEqual([]);
  });

  it('reports route and incident segment references', () => {
    const result = validateRailTopology(
      base({
        routes: [{ id: 'r1', segmentIds: [] }],
        incidents: [{ id: 'i1', kind: 'maintenance', segmentIds: ['ghost'] }],
      })
    );
    expect(result).toContainEqual(
      expect.objectContaining({ code: 'empty-segment-list', entityId: 'r1', severity: 'warning' })
    );
    expect(result).toContainEqual(expect.objectContaining({ code: 'missing-segment', entityId: 'i1' }));
  });

  it('warns on orphaned control points', () => {
    const result = validateRailTopology(base({ controlPoints: [cp('a'), cp('b'), cp('lonely')] }));
    expect(result).toContainEqual(expect.objectContaining({ code: 'orphaned', entityId: 'lonely', severity: 'warning' }));
    expect(result.filter((i) => i.entityId === 'a' && i.code === 'orphaned')).toEqual([]);
  });
});
