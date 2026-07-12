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

const DATA_QUALITY_STATES: ReadonlySet<RailEntityState> = new Set<RailEntityState>(['stale', 'unknown', 'no_data']);

/**
 * Compose multiple query results on one entity. Live operational states are
 * ranked by severity among themselves — a failed status can never be masked
 * by a clear occupancy. Data-quality states (stale/unknown/no_data) apply
 * only when NO query resolved live data: one flapping secondary series must
 * not repaint a corridor gray while live occupancy telemetry exists.
 */
function worstState(candidates: ResolvedRailState[]): ResolvedRailState {
  const bySeverity = (worst: ResolvedRailState, c: ResolvedRailState) =>
    STATE_SEVERITY[c.state] > STATE_SEVERITY[worst.state] ? c : worst;
  const live = candidates.filter((c) => !DATA_QUALITY_STATES.has(c.state));
  if (live.length > 0) {
    return live.reduce(bySeverity);
  }
  return candidates.reduce(bySeverity);
}

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
  // Defensive shape checks mirror normalizeValueMappings: hand-built configs
  // in tests (or direct API use) may not have passed normalization.
  const list = Array.isArray(mappings) ? mappings : [];
  const mapping = list.find(
    (m) =>
      m &&
      typeof m === 'object' &&
      (typeof m.value === 'number'
        ? m.value === value
        : typeof m.value === 'string' && m.value !== '' && Number(m.value) === value)
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
/** Signal aspects: 0 = stop, 1 = approach/caution, 2 = clear (simulator convention). */
export const signalAspectDefault = (value: number): RailEntityState =>
  value === 0 ? 'stop' : value === 1 ? 'caution' : value === 2 ? 'clear' : 'unknown';

/**
 * Discrete switch (points) position — not a RailEntityState because it is a
 * mechanical position, not an operational severity. Convention: 0 = normal,
 * 1 = reverse, 2 = moving/in transition.
 */
export type SwitchPosition = 'normal' | 'reverse' | 'moving' | 'unknown';

export interface ResolvedSwitchState {
  position: SwitchPosition;
  /** Highest-severity operational state across detection and health. */
  state: RailEntityState;
  color: string;
  detected: boolean;
  locked: boolean;
}

export function resolveSwitchState(
  sw: { positionQuery?: string; detectedQuery?: string; lockedQuery?: string; healthQuery?: string },
  frameMap: Map<string, number>
): ResolvedSwitchState {
  const positionValue = sw.positionQuery ? frameMap.get(sw.positionQuery) : undefined;
  const position: SwitchPosition =
    positionValue === 0 ? 'normal' : positionValue === 1 ? 'reverse' : positionValue === 2 ? 'moving' : 'unknown';

  const detectedValue = sw.detectedQuery ? frameMap.get(sw.detectedQuery) : undefined;
  // No detection query -> assume detected (schematic map); an explicit 0 is
  // the alarm condition.
  const detected = sw.detectedQuery ? detectedValue !== undefined && detectedValue !== 0 : true;
  const lockedValue = sw.lockedQuery ? frameMap.get(sw.lockedQuery) : undefined;
  const locked = lockedValue !== undefined && lockedValue !== 0;

  const candidates = [
    resolveRailQuery(sw.healthQuery, undefined, frameMap, statusDefault),
    sw.detectedQuery
      ? detectedValue === undefined
        ? resolved('no_data')
        : detected
        ? resolved('normal', detectedValue)
        : resolved('caution', detectedValue)
      : undefined,
    sw.positionQuery && positionValue === undefined ? resolved('no_data') : undefined,
  ].filter((c): c is ResolvedRailState => c !== undefined);
  const worst = candidates.length === 0 ? resolved('normal') : worstState(candidates);
  return { position, state: worst.state, color: worst.color, detected, locked };
}

/**
 * Compose a signal's display state: the aspect (stop/caution/clear by the
 * documented 0/1/2 convention or explicit mappings) unless health/data
 * quality is worse — a failed signal head must show failed, not its last
 * known aspect. A signal with no queries at all is 'unknown' (hollow glyph).
 */
export function resolveSignalState(
  signal: { stateQuery?: string; healthQuery?: string; valueMappings?: RailValueMapping[] },
  frameMap: Map<string, number>
): ResolvedRailState {
  const candidates = [
    resolveRailQuery(signal.stateQuery, signal.valueMappings, frameMap, signalAspectDefault),
    resolveRailQuery(signal.healthQuery, undefined, frameMap, statusDefault),
  ].filter((c): c is ResolvedRailState => c !== undefined);
  if (candidates.length === 0) {
    return resolved('unknown');
  }
  return worstState(candidates);
}

/**
 * Overlay activation (routes, incidents/maintenance): no query -> always
 * active (statically authored overlay); query resolving to 0 -> inactive
 * (hidden); missing series -> inactive, so a torn-down route can never appear
 * established because its query vanished.
 */
export function overlayActive(stateQuery: string | undefined, frameMap: Map<string, number>): boolean {
  if (!stateQuery) {
    return true;
  }
  const value = frameMap.get(stateQuery);
  return value !== undefined && Number.isFinite(value) && value !== 0;
}

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
  return worstState(candidates);
}
