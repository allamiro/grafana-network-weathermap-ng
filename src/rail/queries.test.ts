import { RAIL_STATE_COLORS, RailTrackSegment } from './types';
import {
  availabilityDefault,
  occupancyDefault,
  resolveRailQuery,
  resolveSegmentState,
  statusDefault,
} from './queries';

const seg = (extra: Partial<RailTrackSegment>): RailTrackSegment => ({
  id: 't1',
  fromControlPointId: 'a',
  toControlPointId: 'b',
  trackNumber: '1',
  direction: 'eastbound',
  ...extra,
});

const frames = (entries: Record<string, number>) => new Map(Object.entries(entries));

describe('resolveRailQuery', () => {
  it('returns undefined (neutral, not an error) when no query is configured', () => {
    expect(resolveRailQuery(undefined, undefined, frames({}), statusDefault)).toBeUndefined();
    expect(resolveRailQuery('', undefined, frames({}), statusDefault)).toBeUndefined();
  });

  it('resolves no_data when the query matches no series', () => {
    const result = resolveRailQuery('TRACK X', undefined, frames({}), statusDefault)!;
    expect(result.state).toBe('no_data');
    expect(result.color).toBe(RAIL_STATE_COLORS.no_data);
  });

  it('resolves no_data for non-finite series values', () => {
    expect(resolveRailQuery('Q', undefined, frames({ Q: NaN }), statusDefault)!.state).toBe('no_data');
  });

  it('applies explicit value mappings before default conventions, with color/label overrides', () => {
    const mappings = [
      { value: 2, state: 'maintenance' as const, color: '#123456', label: 'Possession' },
      { value: '3', state: 'degraded' as const },
    ];
    const mapped = resolveRailQuery('Q', mappings, frames({ Q: 2 }), statusDefault)!;
    expect(mapped.state).toBe('maintenance');
    expect(mapped.color).toBe('#123456');
    expect(mapped.label).toBe('Possession');
    // String-typed mapping values compare numerically.
    expect(resolveRailQuery('Q', mappings, frames({ Q: 3 }), statusDefault)!.state).toBe('degraded');
    // Unmapped values fall back to the default convention.
    expect(resolveRailQuery('Q', mappings, frames({ Q: 1 }), statusDefault)!.state).toBe('normal');
  });

  it('documents the three default conventions', () => {
    expect(occupancyDefault(1)).toBe('occupied');
    expect(occupancyDefault(0)).toBe('clear');
    expect(availabilityDefault(1)).toBe('normal');
    expect(availabilityDefault(0)).toBe('blocked');
    expect(statusDefault(1)).toBe('normal');
    expect(statusDefault(0)).toBe('failed');
  });
});

describe('resolveSegmentState', () => {
  it('is neutral normal when the segment has no queries', () => {
    expect(resolveSegmentState(seg({}), frames({})).state).toBe('normal');
  });

  it('reports occupancy through the default convention', () => {
    expect(resolveSegmentState(seg({ occupancyQuery: 'OCC' }), frames({ OCC: 1 })).state).toBe('occupied');
    expect(resolveSegmentState(seg({ occupancyQuery: 'OCC' }), frames({ OCC: 0 })).state).toBe('clear');
  });

  it('a failed status can never be masked by a clear occupancy (severity composition)', () => {
    const state = resolveSegmentState(
      seg({ statusQuery: 'ST', occupancyQuery: 'OCC' }),
      frames({ ST: 0, OCC: 0 })
    );
    expect(state.state).toBe('failed');
  });

  it('availability 0 reports blocked even while occupied', () => {
    const state = resolveSegmentState(
      seg({ availabilityQuery: 'AV', occupancyQuery: 'OCC' }),
      frames({ AV: 0, OCC: 1 })
    );
    expect(state.state).toBe('blocked');
  });

  it('a missing series on one query does not mask live data on another', () => {
    const state = resolveSegmentState(seg({ statusQuery: 'GONE', occupancyQuery: 'OCC' }), frames({ OCC: 1 }));
    expect(state.state).toBe('occupied');
    // Even a live CLEAR beats a data-quality state: one flapping secondary
    // series must not repaint a healthy corridor gray (#300 review fix).
    const clear = resolveSegmentState(seg({ statusQuery: 'GONE', occupancyQuery: 'OCC' }), frames({ OCC: 0 }));
    expect(clear.state).toBe('clear');
  });

  it('malformed value mappings can never crash resolution', () => {
    const hostileMappings = [null, 42, { value: null, state: 'failed' }, { value: '', state: 'failed' }] as never;
    const state = resolveSegmentState(
      seg({ occupancyQuery: 'OCC', valueMappings: hostileMappings }),
      frames({ OCC: 0 })
    );
    // null/'' mapping values must not match raw 0 via Number() coercion.
    expect(state.state).toBe('clear');
  });

  it('reports no_data when every configured query is unresolved', () => {
    expect(resolveSegmentState(seg({ statusQuery: 'GONE' }), frames({})).state).toBe('no_data');
  });
});
