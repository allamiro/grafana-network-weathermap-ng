/**
 * Rail state resolution (#300): map read-only telemetry values onto the
 * categorical RailEntityState vocabulary. Never bandwidth-percentage
 * semantics — occupancy, availability, and status are discrete.
 */
import { RAIL_STATE_COLORS, RailEntityState, RailTrackSegment, RailValueMapping } from './types';

export interface ResolvedRailState {
  state: RailEntityState;
  color: string;
  /** Raw query value, when a query was configured and resolved. */
  value?: number;
  /** Optional label override from an explicit value mapping. */
  label?: string;
}

/**
 * Severity ranking for composing multiple query results on one entity: the
 * highest-severity resolved state paints the entity. Data-quality states rank
 * below operational ones so a stale secondary query cannot mask a failure,
 * but above nothing — an entity whose only signal is "no data" shows that.
 */
const STATE_SEVERITY: Record<RailEntityState, number> = {
  failed: 10,
  blocked: 9,
  stop: 8,
  degraded: 7,
  maintenance: 6,
  caution: 5,
  approach: 5,
  occupied: 4,
  stale: 3,
  unknown: 2,
  no_data: 1,
  clear: 0,
  normal: 0,
};

export function railStateColor(state: RailEntityState): string {
  return RAIL_STATE_COLORS[state] ?? RAIL_STATE_COLORS.unknown;
}

const resolved = (state: RailEntityState, value?: number, mapping?: RailValueMapping): ResolvedRailState => ({
  state,
  color: mapping?.color ?? railStateColor(state),
  ...(value !== undefined ? { value } : {}),
  ...(mapping?.label !== undefined ? { label: mapping.label } : {}),
});

/**
 * Resolve one query against the frame map. `defaultMapping` supplies the
 * meaning of raw values when the user configured no explicit mappings —
 * occupancy and availability have opposite truthy semantics, so the caller
 * must say which convention applies.
 */
export function resolveRailQuery(
  query: string | undefined,
  mappings: RailValueMapping[] | undefined,
  frameMap: Map<string, number>,
  defaultMapping: (value: number) => RailEntityState
): ResolvedRailState | undefined {
  if (!query) {
    // Not monitored: neutral infrastructure, not an error state.
    return undefined;
  }
  const value = frameMap.get(query);
  if (value === undefined || !Number.isFinite(value)) {
    return resolved('no_data');
  }
  const mapping = (mappings ?? []).find((m) =>
    typeof m.value === 'number' ? m.value === value : Number(m.value) === value
  );
  if (mapping) {
    return resolved(mapping.state, value, mapping);
  }
  return resolved(defaultMapping(value), value);
}

/** Default conventions (documented in the rail docs): */
export const occupancyDefault = (value: number): RailEntityState => (value !== 0 ? 'occupied' : 'clear');
export const availabilityDefault = (value: number): RailEntityState => (value !== 0 ? 'normal' : 'blocked');
export const statusDefault = (value: number): RailEntityState => (value !== 0 ? 'normal' : 'failed');

/**
 * Compose a track segment's visual state from its three optional queries:
 * the highest-severity resolved state wins, so a failed status can never be
 * masked by a clear occupancy. A segment with no queries at all is neutral
 * 'normal' infrastructure.
 */
export function resolveSegmentState(segment: RailTrackSegment, frameMap: Map<string, number>): ResolvedRailState {
  const candidates = [
    resolveRailQuery(segment.statusQuery, segment.valueMappings, frameMap, statusDefault),
    resolveRailQuery(segment.availabilityQuery, segment.valueMappings, frameMap, availabilityDefault),
    resolveRailQuery(segment.occupancyQuery, segment.valueMappings, frameMap, occupancyDefault),
  ].filter((c): c is ResolvedRailState => c !== undefined);
  if (candidates.length === 0) {
    return resolved('normal');
  }
  return candidates.reduce((worst, c) => (STATE_SEVERITY[c.state] > STATE_SEVERITY[worst.state] ? c : worst));
}
