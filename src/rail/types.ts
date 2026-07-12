/**
 * Rail Operations mode data model (#300). Monitoring-only: these objects
 * visualize read-only telemetry. Nothing in this module (or the rest of the
 * rail feature) issues commands to signalling, interlocking, PLC, RTU, or
 * SCADA systems.
 *
 * Standalone on purpose: no imports from src/types.ts, so the core options
 * module can import rail types without a cycle. Both `mapMode` and the `rail`
 * container are optional on the saved Weathermap — an absent mapMode means
 * 'network' and an absent rail block means the feature is entirely off, so
 * pre-existing dashboards are untouched and no migration is required (same
 * contract as settings.animation, #264).
 */

export type MapMode = 'network' | 'rail';

export type RailControlPointType =
  | 'station'
  | 'junction'
  | 'interlocking'
  | 'yard'
  | 'terminal'
  | 'depot'
  | 'control_point';

export type TrackDirection =
  | 'eastbound'
  | 'westbound'
  | 'northbound'
  | 'southbound'
  | 'inbound'
  | 'outbound'
  | 'bidirectional';

/**
 * Categorical operational states. Deliberately NOT the bandwidth-percentage
 * scale: track occupancy, signal aspects, and equipment health are discrete
 * values resolved through explicit mappings.
 */
export type RailEntityState =
  | 'normal'
  | 'clear'
  | 'occupied'
  | 'approach'
  | 'stop'
  | 'caution'
  | 'blocked'
  | 'degraded'
  | 'maintenance'
  | 'failed'
  | 'stale'
  | 'unknown'
  | 'no_data';

/**
 * Default state colors. Maintenance/stale/no-data are deliberately off the
 * green->red utilization ramp so a failed or unmonitored element can never be
 * misread as a utilization level. Color is never the only signal — renderers
 * pair these with shape, pattern, or text.
 */
export const RAIL_STATE_COLORS: Record<RailEntityState, string> = {
  normal: '#39C54A',
  clear: '#39C54A',
  occupied: '#3B82F6',
  approach: '#F2C94C',
  stop: '#EF4444',
  caution: '#F2C94C',
  blocked: '#EF4444',
  degraded: '#F97316',
  maintenance: '#A855F7',
  failed: '#EF4444',
  stale: '#7C8799',
  unknown: '#7C8799',
  no_data: '#5D6674',
};

/** Maps a raw query value onto a categorical state (and optional label/color override). */
export interface RailValueMapping {
  value: string | number;
  state: RailEntityState;
  color?: string;
  label?: string;
}

export interface RailControlPoint {
  id: string;
  type: RailControlPointType;
  position: [number, number];
  label: string;
  shortLabel?: string;
  statusQuery?: string;
  dashboardLink?: string;
  layerId?: string;
  zIndex?: number;
}

/**
 * One physical track. Two parallel railway tracks are two independent
 * RailTrackSegment objects — never the A/Z sides of one network link. The
 * complete ordered polyline is derived, not stored:
 *
 *   [fromControlPoint.position, ...(viaPoints ?? []), toControlPoint.position]
 *
 * viaPoints holds only the intermediate waypoints (no duplicated endpoints),
 * so moving a control point moves every connected track with it.
 */
export interface RailTrackSegment {
  id: string;
  fromControlPointId: string;
  toControlPointId: string;
  trackNumber: string;
  direction: TrackDirection;
  blockId?: string;
  viaPoints?: Array<[number, number]>;
  occupancyQuery?: string;
  availabilityQuery?: string;
  statusQuery?: string;
  valueMappings?: RailValueMapping[];
  strokeWidth?: number;
  showLabel?: boolean;
  layerId?: string;
  zIndex?: number;
}

export interface RailSignal {
  id: string;
  segmentId: string;
  /** Normalized position along the segment polyline, 0..1. */
  positionPercent: number;
  facingDirection: TrackDirection;
  stateQuery?: string;
  healthQuery?: string;
  /** Overrides the default aspect convention (0=stop, 1=caution, 2=clear). */
  valueMappings?: RailValueMapping[];
  label?: string;
  layerId?: string;
  zIndex?: number;
}

export interface RailSwitch {
  id: string;
  controlPointId?: string;
  normalSegmentId: string;
  reverseSegmentId: string;
  positionQuery?: string;
  detectedQuery?: string;
  lockedQuery?: string;
  healthQuery?: string;
  label?: string;
  layerId?: string;
  zIndex?: number;
}

export interface RailCrossover {
  id: string;
  trackSegmentIds: string[];
  geometry: 'single' | 'double' | 'scissors';
  stateQuery?: string;
  label?: string;
  layerId?: string;
  zIndex?: number;
}

/**
 * An individually identified train, located by segment + normalized progress.
 * A train is not a traffic-flow particle. Rendering is deferred until the
 * generic moving-entity capability (#266) is resolved; the schema ships first
 * so saved maps are forward-compatible.
 */
export interface RailTrainMarker {
  id: string;
  label?: string;
  labelQuery?: string;
  segmentId?: string;
  segmentQuery?: string;
  /** Static normalized progress along the segment polyline, 0..1. */
  progress?: number;
  progressQuery?: string;
  direction?: TrackDirection;
  directionQuery?: string;
  speedQuery?: string;
  delayQuery?: string;
  destinationQuery?: string;
  statusQuery?: string;
  staleQuery?: string;
  dashboardLink?: string;
  layerId?: string;
  zIndex?: number;
}

export interface RailRoute {
  id: string;
  label?: string;
  segmentIds: string[];
  stateQuery?: string;
  color?: string;
  layerId?: string;
  zIndex?: number;
}

export interface RailIncidentOverlay {
  id: string;
  kind: 'incident' | 'maintenance' | 'possession';
  segmentIds: string[];
  label?: string;
  stateQuery?: string;
  layerId?: string;
  zIndex?: number;
}

export interface MapLayer {
  id: string;
  label: string;
  visible: boolean;
  locked: boolean;
  zIndex: number;
  minZoom?: number;
  maxZoom?: number;
}

export interface RailOperationsConfig {
  controlPoints: RailControlPoint[];
  trackSegments: RailTrackSegment[];
  signals: RailSignal[];
  switches: RailSwitch[];
  crossovers: RailCrossover[];
  trains: RailTrainMarker[];
  routes: RailRoute[];
  incidents: RailIncidentOverlay[];
  layers: MapLayer[];
}

/**
 * Hover-tooltip contract shared by every rail renderer: a title plus plain
 * text lines. Neutral here (not in a glyph component) because control points,
 * tracks, signals, switches, crossovers, overlays, and trains all emit it.
 */
export interface RailHoverTarget {
  title: string;
  lines: string[];
}

/**
 * Structured, non-fatal topology validation result. Validation reports user
 * configuration problems — it never throws and never deletes objects.
 */
export interface RailValidationIssue {
  severity: 'error' | 'warning';
  entityType: string;
  entityId?: string;
  code: string;
  message: string;
}
