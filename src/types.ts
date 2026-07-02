import { DataFrame } from '@grafana/data';

export interface PanelOptions {
  backgroundColor: string;
  backgroundImage?: BGImageOptions;
  panelSize: AreaSize;
  zoomScale: number;
  offset: Position;
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
}

export interface LinkSide {
  bandwidth: number;
  bandwidthQuery: string | undefined;
  query: string | undefined;
  labelOffset: number;
  anchor: Anchor;
  dashboardLink: string;
  portLabel?: string;
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
  };
  fontSizing: {
    node: number;
    link: number;
  };
  colorScaleMode?: 'percent' | 'value';
  panel: PanelOptions;
  tooltip: TooltipOptions;
  scale: TrafficPanelSettings;
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
