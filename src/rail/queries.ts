/**
 * Rail state resolution (#300): map read-only telemetry values onto the
 * categorical RailEntityState vocabulary. Never bandwidth-percentage
 * semantics — occupancy, availability, and status are discrete.
 */
import { clampProgress } from '../geometry/polyline';
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
  ].filter((c): c is ResolvedRailState => c !== undefined);
  let worst = candidates.length === 0 ? resolved('normal') : worstState(candidates);
  // The position is the switch's PRIMARY datum: when its series is missing
  // or non-finite, a live-healthy secondary (detection/health) must not make
  // the glyph read as confidently normal. Real alarms still win.
  const positionMissing = sw.positionQuery && (positionValue === undefined || !Number.isFinite(positionValue));
  if (positionMissing && (worst.state === 'normal' || worst.state === 'clear')) {
    worst = resolved('no_data');
  }
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
  const aspect = resolveRailQuery(signal.stateQuery, signal.valueMappings, frameMap, signalAspectDefault);
  const health = resolveRailQuery(signal.healthQuery, undefined, frameMap, statusDefault);
  const candidates = [aspect, health].filter((c): c is ResolvedRailState => c !== undefined);
  if (candidates.length === 0) {
    return resolved('unknown');
  }
  let worst = worstState(candidates);
  // The aspect is the signal's PRIMARY datum: when its series vanished, a
  // live-healthy machine-health reading must not paint a confident aspect —
  // the head renders hollow no_data. A worse live state (failed) still wins.
  if (aspect && aspect.state === 'no_data' && (worst.state === 'normal' || worst.state === 'clear')) {
    worst = aspect;
  }
  return worst;
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

/** Resolved live telemetry for one train marker (#300 Phase 4). */
export interface ResolvedTrainTelemetry {
  /** Segment the train is on (static or data-driven); undefined = not placeable. */
  segmentId?: string;
  /** Clamped 0..1 progress along that segment; undefined = not placeable. */
  progress?: number;
  speed?: number;
  delay?: number;
  destination?: number;
  stale: boolean;
  state: ResolvedRailState;
}

/**
 * Resolve a train's position and telemetry. A train is an individually
 * identified object located by segment + normalized progress — never a
 * traffic-flow particle.
 *
 * Data-driven position uses a series-name prefix convention: with
 * segmentQuery = "TRAIN RD-218", a series named "TRAIN RD-218 t1-b03" with
 * value 0.63 places the train 63% along segment "t1-b03". One gauge per
 * (train, current segment) — exactly what a Prometheus exporter publishes as
 * rail_train_progress{train_id, segment_id} — so when the train advances to
 * the next block the old series vanishes and the new one takes over. Static
 * segmentId + progress/progressQuery remain available for authored demos.
 */
export function resolveTrainTelemetry(
  train: {
    segmentId?: string;
    segmentQuery?: string;
    progress?: number;
    progressQuery?: string;
    speedQuery?: string;
    delayQuery?: string;
    destinationQuery?: string;
    statusQuery?: string;
    staleQuery?: string;
  },
  frameMap: Map<string, number>,
  /**
   * Known track segment ids. When provided, the prefix scan only accepts a
   * series whose suffix is EXACTLY one of them — so a train named "TRAIN A"
   * can never capture "TRAIN A EXPRESS t1" (another train whose name extends
   * this one) and extract the garbage segment "EXPRESS t1".
   */
  knownSegmentIds?: ReadonlySet<string>,
  /**
   * Last sample timestamp per series display name. Range queries keep a
   * vanished series (the block the train ALREADY LEFT) in the result for the
   * whole dashboard time range, so when several series match the prefix the
   * FRESHEST one is the train's real position — without timestamps a marker
   * can freeze at the end of the first block it ever rode.
   */
  frameTimestamps?: ReadonlyMap<string, number>
): ResolvedTrainTelemetry {
  let segmentId = train.segmentId;
  let progress: number | undefined;
  let scanResolved = false;

  if (train.segmentQuery) {
    const prefix = `${train.segmentQuery} `;
    let bestTimestamp = -Infinity;
    for (const [name, value] of frameMap) {
      if (!name.startsWith(prefix) || !Number.isFinite(value)) {
        continue;
      }
      const suffix = name.slice(prefix.length).trim();
      if (knownSegmentIds && !knownSegmentIds.has(suffix)) {
        continue;
      }
      const timestamp = frameTimestamps?.get(name);
      if (!scanResolved || (timestamp !== undefined && timestamp > bestTimestamp)) {
        segmentId = suffix;
        progress = clampProgress(value);
        scanResolved = true;
        bestTimestamp = timestamp ?? -Infinity;
      }
      if (!frameTimestamps) {
        break; // no freshness info: first valid match wins, as before
      }
    }
  }

  if (progress === undefined && train.progressQuery) {
    const raw = frameMap.get(train.progressQuery);
    if (raw !== undefined && Number.isFinite(raw)) {
      progress = clampProgress(raw);
    }
  }
  if (progress === undefined && typeof train.progress === 'number' && Number.isFinite(train.progress)) {
    progress = clampProgress(train.progress);
  }

  const numeric = (query: string | undefined): number | undefined => {
    if (!query) {
      return undefined;
    }
    const value = frameMap.get(query);
    return value !== undefined && Number.isFinite(value) ? value : undefined;
  };

  const staleValue = numeric(train.staleQuery);
  // Stale when: the explicit flag says so; a configured position resolved
  // nothing at all; or the PRIMARY data-driven binding (segmentQuery)
  // vanished and only an authored fallback produced a position — a fallback
  // placement must never read as fresh live telemetry.
  const positionConfigured = Boolean(train.segmentQuery || train.progressQuery);
  const stale =
    (staleValue !== undefined && staleValue !== 0) ||
    (positionConfigured && progress === undefined) ||
    (Boolean(train.segmentQuery) && !scanResolved);

  // Severity doctrine: a live alarm (failed/blocked/caution...) always beats
  // the stale wash; stale in turn beats normal/clear — matching signals and
  // switches, where real alarms win but missing primaries never read healthy.
  const status = resolveRailQuery(train.statusQuery, undefined, frameMap, statusDefault);
  const staleState = resolved('stale');
  let state: ResolvedRailState;
  if (stale) {
    state = status && STATE_SEVERITY[status.state] > STATE_SEVERITY.stale ? status : staleState;
  } else {
    state = status ?? resolved('normal');
  }

  return {
    segmentId,
    progress,
    speed: numeric(train.speedQuery),
    delay: numeric(train.delayQuery),
    destination: numeric(train.destinationQuery),
    stale,
    state,
  };
}
