import { DataFrame } from '@grafana/data';

export interface PanelOptions {
  backgroundColor: string;
  backgroundImage?: BGImageOptions;
  panelSize: AreaSize;
  zoomScale: number;
  offset: Position;
  // Opt-in wheel zoom + drag pan while VIEWING the dashboard (#306). The
  // viewer's zoom/pan stays local to their browser session and is never
  // written back into the saved panel options; double-click resets it.
  // Absent = off, preserving the existing behavior (view zoom only via
  // Shift+wheel, no migration required).
  viewZoomPan?: boolean;
  showTimestamp: boolean;
  grid: {
    enabled: boolean;
    size: number;
    guidesEnabled: boolean;
  };
}

export interface BGImageOptions {
  url: string;
  fit: string;
  // When true, the background image is drawn inside the map canvas so it pans
  // and zooms together with the nodes/links instead of staying static.
  attachToCanvas?: boolean;
}

export interface TooltipOptions {
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  inboundColor: string;
  outboundColor: string;
  scaleToBandwidth: boolean;
}

export interface AreaSize {
  width: number;
  height: number;
}

// How a metric value is resolved from the data points within the selected
// dashboard time range.
export type ValueMappingMode = 'last' | 'avg' | 'min' | 'max' | 'p95';

export enum Anchor {
  Center = 0,
  Top,
  Bottom,
  Left,
  Right,
}

export interface NodeAnchor {
  numLinks: number;
  numFilledLinks: number;
}

export interface Icon {
  src: string;
  name: string;
  size: AreaSize;
  padding: {
    vertical: number;
    horizontal: number;
  };
  drawInside: boolean;
}

export interface NodeStatusValueMapping {
  value: number;
  color: string;
}

export interface NodeTooltipMetric {
  label: string;
  query?: string;
  units?: string;
}

export interface Node {
  id: string;
  position: [number, number];
  label?: string;
  showLabel?: boolean;
  dashboardLink?: string;
  openInSameTab?: boolean;
  tooltipMetrics?: NodeTooltipMetric[];
  // Paint order: higher values render on top. Defaults to 0 when unset, in which
  // case nodes keep their creation order (later nodes on top), as before.
  zIndex?: number;
  anchors: {
    [Anchor.Center]: NodeAnchor;
    [Anchor.Top]: NodeAnchor;
    [Anchor.Bottom]: NodeAnchor;
    [Anchor.Left]: NodeAnchor;
    [Anchor.Right]: NodeAnchor;
  };
  useConstantSpacing: boolean;
  compactVerticalLinks: boolean;
  padding: {
    horizontal: number;
    vertical: number;
  };
  colors: {
    font: string;
    background: string;
    border: string;
    statusDown: string;
  };
  nodeIcon: Icon | null;
  useIconBoundaryForLinks?: boolean;
  isConnection: boolean;
  statusQuery?: string;
  statusValueMappings?: NodeStatusValueMapping[];
  nodeStatusColorTarget?: 'border' | 'background' | 'both';
  // Per-node font overrides (#179): structural labels can stay small/muted
  // while important device names stand out. Fall back to the global
  // settings.fontSizing.node when unset.
  fontSize?: number;
  fontBold?: boolean;
}

export interface LinkSide {
  bandwidth: number;
  bandwidthQuery: string | undefined;
  query: string | undefined;
  labelOffset: number;
  anchor: Anchor;
  dashboardLink: string;
  portLabel?: string;
  // Slide this side's port label along the link axis (#309). Signed percentage
  // of the link length added to the default near-endpoint position: positive
  // moves it toward the midpoint, negative toward the node. Unset/0 keeps the
  // existing position, so old maps are unchanged.
  portLabelOffset?: number;
  // Move this side's port label perpendicular to the link line (#309): signed
  // pixels away from the axis in the label's natural direction (positive =
  // further from the line, negative = closer / across). Unset/0 keeps the
  // existing distance, so old maps are unchanged.
  portLabelDistance?: number;
  // Optional explicit direction label for this side (e.g. "Inbound", "Outbound",
  // "To WAN"). When set, the hover tooltip labels this side's value with it
  // instead of the generic Inbound/Outbound wording.
  directionLabel?: string;
}

export interface LinkTooltipMetric {
  label: string;
  queryA?: string;
  queryZ?: string;
  units?: string;
}

export interface Link {
  id: string;
  nodes: [Node, Node];
  sides: {
    A: LinkSide;
    Z: LinkSide;
  };
  units: string | undefined;
  arrows: ArrowOptions;
  stroke: number;
  showThroughputPercentage: boolean;
  // Shifts the whole link sideways, perpendicular to its A->Z axis, so parallel
  // links between the same node pair can be spread apart. Combines with
  // `waypoints` (#336): the entire polyline is translated along that one axis,
  // which preserves its shape and arc length exactly. Unset/0 = no shift.
  linkOffset?: number;
  // Percentage along the A->Z line where the two directional arrows meet.
  // Defaults to 50 (the midpoint) when unset. The renderer clamps the effective
  // value to 5-95 to keep the junction from overlapping either node box, so
  // values outside that range render at the nearest bound.
  arrowMeetPercent?: number;
  tooltipMetrics?: LinkTooltipMetric[];
  statusQuery?: string;
  statusDownColor?: string;
  statusBlink?: boolean;
  // Render only the A->Z direction (#179): one full-length line, one arrow at
  // the Z end, and only the A-side value label. For flows that physically go
  // one way (power feeds, unidirectional replication).
  singleDirection?: boolean;
  // Traffic-flow animation override (#273). 'inherit' (or unset) follows the
  // panel-level switch; 'enabled' animates this link even when the panel
  // switch is off; 'disabled' never animates it.
  animation?: 'inherit' | 'enabled' | 'disabled';
  // Polyline bend points (#332), in panel coordinates, ordered A -> Z. The
  // link is drawn through them as one logical polyline: arrows, value labels,
  // and animation follow the path by arc length. Unset/empty = straight line,
  // so saved maps are unchanged (no migration needed). Stored UNSHIFTED —
  // linkOffset is applied at render time (see chordNormalOffset), so changing
  // the offset never rewrites saved waypoint coordinates.
  waypoints?: Position[];
  // Rounded corner radius in px for waypoint bends (#336). Each bend is
  // replaced by a flattened quadratic curve of this radius (clamped to half
  // of each adjacent segment). Unset/0 = sharp corners, exactly as before —
  // no migration needed. Only meaningful while waypoints are set.
  cornerRadius?: number;
}

export interface DrawnNode extends Node {
  filledLinks: number;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  labelWidth: number;
}

export interface Position {
  x: number;
  y: number;
}

export interface DrawnLinkSide extends LinkSide {
  currentValue: number;
  currentText: string;
  currentBandwidthText: string;
  currentValueText: string;
  currentPercentageText: string;
}
export interface DrawnLink extends Link {
  sides: {
    A: DrawnLinkSide;
    Z: DrawnLinkSide;
  };
  index: number;
  source: DrawnNode;
  target: DrawnNode;
  lineStartA: Position;
  lineEndA: Position;
  arrowCenterA: Position;
  arrowPolygonA: any;
  lineStartZ: Position;
  lineEndZ: Position;
  arrowCenterZ: Position;
  arrowPolygonZ: any;
  isDown: boolean;
  // Polyline geometry (#332). pathPoints is the full drawn path
  // [lineStartA, ...waypoints, lineStartZ]; the halves are the sub-paths each
  // direction renders (A: node -> its arrow end; Z: node -> its arrow end).
  // Absent on legacy DrawnLink fixtures — consumers fall back to the straight
  // lineStart/lineEnd pairs.
  pathPoints?: Position[];
  pathPointsA?: Position[];
  pathPointsZ?: Position[];
  // The linkOffset translation already baked into the geometry above (#336).
  // Zero when the link has no offset. Editing code needs it to convert between
  // STORED waypoint coordinates and the DRAWN path: handles render at
  // `waypoint + pathOffset`, and a click on the drawn line stores
  // `point - pathOffset`. Absent on legacy DrawnLink fixtures (treat as zero).
  pathOffset?: Position;
}

export interface HoveredLink {
  link: DrawnLink;
  side: 'A' | 'Z';
  mouseX: number;
  mouseY: number;
}

export interface HoveredNode {
  node: DrawnNode;
  mouseX: number;
  mouseY: number;
}

export interface ArrowOptions {
  width: number;
  height: number;
  offset: number;
}

export interface WeathermapSettings {
  link: {
    spacing: {
      horizontal: number;
      vertical: number;
    };
    stroke: {
      color: string;
    };
    label: {
      background: string;
      border: string;
      font: string;
    };
    showAllWithPercentage: boolean;
    defaultUnits?: string;
    linkDecimals?: number;
    valueMappingMode?: ValueMappingMode;
    // When enabled, a timeline slider lets the viewer scrub through the selected
    // time range and see link values as they were at that moment.
    timeline?: {
      enabled: boolean;
    };
    dynamicStroke?: {
      enabled: boolean;
      minWidth: number;
      maxWidth: number;
    };
    flowAnimation?: {
      enabled: boolean;
      speed: number;
    };
    gradientColor?: boolean;
    // Hovering a link highlights its whole VIA chain and fades unrelated
    // links (#179). Off by default.
    hoverHighlight?: boolean;
    // Hide link value labels once zoomed out this many wheel steps or more
    // (zoomScale >= threshold). 0/unset = always show (#179).
    labelHideZoom?: number;
    // Opt-in greedy de-overlap pass that nudges colliding value labels along
    // their link (#179). Off by default so existing maps render unchanged.
    labelCollision?: boolean;
  };
  // Animation foundation (#264) + traffic-flow particles (#273). Optional:
  // an absent block means everything is off, so pre-existing maps are
  // untouched and no migration is required.
  animation?: {
    // Master switch for all animation. Default false.
    enabled: boolean;
    // AND-gate with the OS prefers-reduced-motion preference. Default true.
    respectReducedMotion?: boolean;
    // Hard cap on concurrently animated links. Default 100.
    maxAnimatedLinks?: number;
    // Pause all animation while the panel is being edited. Default true.
    pauseInEditMode?: boolean;
    // Show the built-in legend explaining the animation glyphs (moving dot =
    // live traffic, ✕ = down). Rendered only while animation is active, so a
    // panel without animation never shows it. Default true.
    showLegend?: boolean;
  };
  fontSizing: {
    node: number;
    link: number;
  };
  colorScaleMode?: 'percent' | 'value';
  panel: PanelOptions;
  tooltip: TooltipOptions;
  scale: TrafficPanelSettings;
  // Optional built-in legend explaining status colors (#179), positioned in
  // panel percent coordinates like the utilization scale.
  statusLegend?: {
    enabled: boolean;
    position: Position;
    items: Array<{ color: string; label: string; id?: string }>;
  };
}

export interface Threshold {
  percent: number;
  color: string;
}

export interface TrafficPanelSettings {
  position: Position;
  size: AreaSize;
  title: string;
  fontSizing: {
    title: number;
    threshold: number;
  };
  // Optional explicit font color (#278). Unset keeps the automatic contrast
  // against the panel background color — which cannot account for background
  // images or light map content underneath the scale.
  fontColor?: string;
  // Optional background box behind the scale (#278). Unset = transparent,
  // exactly as before.
  backgroundColor?: string;
  // Optional Grafana unit id (e.g. 'bps', 'binbps', 'Bps') used to format the
  // Absolute Value scale legend labels through getValueFormat, so a threshold
  // of 500000000 renders as "500 Mb/s" instead of a raw number (#327). Unset =
  // raw numbers, exactly as before. Ignored in Percentage mode.
  scaleUnit?: string;
}

export interface Weathermap {
  version: number;
  id: string;
  nodes: Node[];
  links: Link[];
  scale: Threshold[];
  settings: WeathermapSettings;
}

export interface SimpleOptions {
  weathermap: Weathermap;
}

export interface DataFrameWithId extends DataFrame {
  id: string;
}
