import { DataFrame, Field, FieldType, GrafanaTheme2, getFieldDisplayName } from '@grafana/data';
import merge from 'lodash.merge';
import { Anchor, DrawnNode, Link, Node, ValueMappingMode, Weathermap } from 'types';
import { v4 as uuidv4 } from 'uuid';

export const CURRENT_VERSION = 14;

let colorsCalculatedCache: { [colors: string]: string } = {};

/**
 * Creates a solid color from an translucent foreground.
 * @param fg foreground color
 * @param bg background color
 * @returns calculated solid color
 */
export function getSolidFromAlphaColor(fg: string, bg: string): string {
  if (bg.startsWith('image')) {
    return getSolidFromAlphaColor(fg, bg.split('|', 3)[1]);
  }

  if (colorsCalculatedCache[fg + bg]) {
    return colorsCalculatedCache[fg + bg];
  }

  let fgColor = parseColor(fg.toUpperCase());
  if (fgColor.length < 4) {
    return fg;
  }

  let bgColor = parseColor(bg.toUpperCase());
  if (bgColor.length < 4) {
    bgColor.push(1.0);
  }

  let finalColor = [
    bgColor[0] + (fgColor[0] - bgColor[0]) * fgColor[3],
    bgColor[1] + (fgColor[1] - bgColor[1]) * fgColor[3],
    bgColor[2] + (fgColor[2] - bgColor[2]) * fgColor[3],
  ];

  colorsCalculatedCache[fg + bg] = `rgb(${finalColor.join(',')})`;
  return `rgb(${finalColor.join(',')})`;
}

/**
 * Parses a given color into a useable rgb array.
 * @param input rgb or hex css string
 * @returns color as rgb array
 */
function parseColor(input: string) {
  if (input.substring(0, 1) === '#') {
    let collen = (input.length - 1) / 3;
    let factors = [17, 1, 0.062272];
    let fact = factors[collen - 1];
    return [
      Math.round(parseInt(input.substring(1, 1 + collen), 16) * fact),
      Math.round(parseInt(input.substring(1 + collen, 1 + 2 * collen), 16) * fact),
      Math.round(parseInt(input.substring(1 + 2 * collen), 16) * fact),
    ];
  } else {
    return input
      .split('(')[1]
      .split(')')[0]
      .split(',')
      .map((x) => +x);
  }
}

// Taken from https://github.com/grafana/grafana/blob/main/packages/grafana-ui/src/utils/measureText.ts
// I want to ensure this function remains available regardless of Grafana version
let context: CanvasRenderingContext2D;
const cache = new Map<string, TextMetrics>();
const cacheLimit = 500;
let ctxFontStyle = '';

function getCanvasContext() {
  if (!context) {
    context = document.createElement('canvas').getContext('2d')!;
  }
  return context;
}

export function measureText(text: string, fontSize: number): TextMetrics {
  const fontStyle = `${fontSize}px 'Roboto'`;
  const cacheKey = text + fontStyle;
  const fromCache = cache.get(cacheKey);

  if (fromCache) {
    return fromCache;
  }

  const context = getCanvasContext();

  if (ctxFontStyle !== fontStyle) {
    context.font = ctxFontStyle = fontStyle;
  }

  const metrics = context.measureText(text);

  if (cache.size === cacheLimit) {
    cache.clear();
  }

  cache.set(cacheKey, metrics);

  return metrics;
}

// Find the nearest place to snap to on the grid
export function nearestMultiple(input: number, grid: number): number {
  return Math.ceil(input / grid) * grid;
}

// Calculate the automatically determined widths for nodes with multiple links.
export function calculateRectangleAutoWidth(d: DrawnNode, wm: Weathermap): number {
  const widerSideLinks = Math.max(d.anchors[Anchor.Top].numLinks, d.anchors[Anchor.Bottom].numLinks);
  // Gets the maximum width of any link associated with this node.
  const maxLinkHeight = Math.max(
    ...wm.links
      .filter((l) => l.nodes[0].id === d.id || l.nodes[1].id === d.id)
      .filter(
        (l) =>
          [Anchor.Bottom, Anchor.Top].includes(l.sides.A.anchor) ||
          [Anchor.Bottom, Anchor.Top].includes(l.sides.Z.anchor)
      )
      .map((l) => l.stroke),
    0
  );

  const maxWidth =
    maxLinkHeight * (widerSideLinks - 1) +
    wm.settings.link.spacing.horizontal * (widerSideLinks - 1) +
    d.padding.horizontal * 2;

  let final = 0;
  if (d.label !== undefined) {
    const labeledWidth = d.labelWidth + d.padding.horizontal * 2;
    if (!d.useConstantSpacing) {
      final = labeledWidth;
    } else {
      final = Math.max(labeledWidth, maxWidth);
    }
  } else {
    final = 0;
  }

  if (
    d.nodeIcon?.drawInside &&
    final < d.nodeIcon.padding.horizontal + d.nodeIcon.size.width + d.padding.horizontal * 2
  ) {
    final += d.nodeIcon.padding.horizontal + d.nodeIcon.size.width + d.padding.horizontal * 2 - final;
  }
  return final;
}

// Calculate the auto-determined height of a node's rectangle
export function calculateRectangleAutoHeight(d: DrawnNode, wm: Weathermap): number {
  const numLinks = Math.max(1, Math.max(d.anchors[Anchor.Left].numLinks, d.anchors[Anchor.Right].numLinks));
  // Gets the maximum height of any link associated with this node.
  const maxLinkHeight = Math.max(
    ...wm.links
      .filter((l) => l.nodes[0].id === d.id || l.nodes[1].id === d.id)
      .filter(
        (l) =>
          [Anchor.Left, Anchor.Right].includes(l.sides.A.anchor) ||
          [Anchor.Left, Anchor.Right].includes(l.sides.Z.anchor)
      )
      .map((l) => l.stroke)
  );
  const nodeFontSize = d.fontSize ?? wm.settings.fontSizing.node;
  let minHeight = nodeFontSize + 2 * d.padding.vertical; // fontSize + padding

  if (d.nodeIcon?.drawInside) {
    minHeight += d.nodeIcon.size.height + 2 * d.nodeIcon.padding.vertical;
  }

  if (d.nodeIcon && d.label === '') {
    minHeight -= nodeFontSize;
  }

  const linkHeight = maxLinkHeight + wm.settings.link.spacing.vertical + 2 * d.padding.vertical;
  const fullHeight = linkHeight * numLinks - wm.settings.link.spacing.vertical;
  let final = !d.compactVerticalLinks && fullHeight > minHeight ? fullHeight : minHeight;

  return final;
}

// Generate a basic Node at a certain position and with a certain label.
export function generateBasicNode(label: string, position: [number, number], theme: GrafanaTheme2): Node {
  return {
    id: uuidv4(),
    position,
    label,
    anchors: {
      0: { numLinks: 0, numFilledLinks: 0 },
      1: { numLinks: 0, numFilledLinks: 0 },
      2: { numLinks: 0, numFilledLinks: 0 },
      3: { numLinks: 0, numFilledLinks: 0 },
      4: { numLinks: 0, numFilledLinks: 0 },
    },
    useConstantSpacing: false,
    compactVerticalLinks: false,
    padding: {
      vertical: 4,
      horizontal: 10,
    },
    colors: {
      font: theme.colors.secondary.contrastText,
      background: theme.colors.secondary.main,
      border: theme.colors.secondary.border,
      statusDown: '#ff0000',
    },
    nodeIcon: {
      src: '',
      name: '',
      size: {
        width: 0,
        height: 0,
      },
      padding: {
        vertical: 0,
        horizontal: 0,
      },
      drawInside: false,
    },
    isConnection: false,
  };
}

export function generateBasicLink(nodes?: [Node, Node]): Link {
  return {
    id: uuidv4(),
    nodes: nodes ? nodes : ([] as unknown as [Node, Node]),
    sides: {
      A: {
        bandwidth: 0,
        bandwidthQuery: undefined,
        query: undefined,
        labelOffset: 55,
        anchor: Anchor.Right,
        dashboardLink: '',
      },
      Z: {
        bandwidth: 0,
        bandwidthQuery: undefined,
        query: undefined,
        labelOffset: 55,
        anchor: Anchor.Left,
        dashboardLink: '',
      },
    },
    units: undefined,
    arrows: {
      width: 8,
      height: 10,
      offset: 2,
    },
    stroke: 8,
    showThroughputPercentage: false,
  };
}

// Handle file uploading errors consistently
export function handleFileUploadErrors(files: FileList | null): void {
  if (files && files[0]) {
    if (files[0].size > 1000000) {
      throw new Error('File must be less than 1MB in size.');
    }
    if (!files[0].type.startsWith('image')) {
      throw new Error('File type must be an image format.');
    }
  }
}

/**
 * Numeric <input> handlers receive NaN from valueAsNumber when the field is
 * blank or mid-edit (e.g. "-"). NaN must never reach the saved options — it
 * propagates into SVG geometry and the viewBox. Required numeric fields keep
 * their previous valid value instead; 0 is a valid value.
 */
export function finiteOrFallback(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * A node's `[x, y]` as finite numbers (#339).
 *
 * `position` comes straight out of saved `options.weathermap`, which is
 * hand-editable, copy-pasteable between dashboards, and can arrive truncated
 * from a partial import. Reading `position[0]` directly meant a missing or
 * `null` position threw and took down the WHOLE panel, while `[NaN, 300]`,
 * `[Infinity, 300]`, a short array, `[]` or `{}` rendered `NaN` into every
 * coordinate derived from it — link endpoints, polyline points, arrow
 * polygons, gradient axes, label placement.
 *
 * This coerces at the RENDER boundary and never rewrites the saved value: a
 * bad coordinate must not be silently persisted over (`options.weathermap` is
 * user data). A node whose position cannot be read draws at `fallback`, so it
 * stays visible and fixable instead of vanishing or killing the panel.
 *
 * Numeric strings are accepted because they already worked — every consumer
 * put them through arithmetic that coerced them, so rejecting them now would
 * break maps that render fine today.
 */
export function finitePosition(pos: unknown, fallback = 0): [number, number] {
  const arr = Array.isArray(pos) ? pos : [];
  return [finiteOrFallback(Number(arr[0]), fallback), finiteOrFallback(Number(arr[1]), fallback)];
}

/** Optional numeric fields: blank or unparsable input becomes undefined. */
export function parseOptionalFiniteNumber(raw: string): number | undefined {
  if (raw.trim() === '') {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Whether a saved weathermap needs the defaults deep-merge before render.
 * True for old/missing schema versions AND for current-version maps whose
 * nested settings are incomplete (hand-edited or provisioned JSON) — render
 * code dereferences these shapes directly, so a malformed current-version
 * map must repair through the same migration path (#224).
 */
export function needsMigration(wm: Weathermap | undefined | null): boolean {
  if (!wm) {
    return false;
  }
  if (!wm.version || wm.version !== CURRENT_VERSION) {
    return true;
  }
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const str = (v: unknown) => typeof v === 'string';
  const get = (o: unknown, ...keys: string[]): unknown =>
    keys.reduce((acc: unknown, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), o);
  const st = wm.settings as unknown;
  // Validate the numeric leaves render code dereferences — presence of an
  // empty object (e.g. panelSize: {}) must also trigger repair.
  return !(
    st &&
    num(get(st, 'link', 'spacing', 'horizontal')) &&
    num(get(st, 'link', 'spacing', 'vertical')) &&
    str(get(st, 'link', 'stroke', 'color')) &&
    str(get(st, 'link', 'label', 'background')) &&
    str(get(st, 'link', 'label', 'border')) &&
    str(get(st, 'link', 'label', 'font')) &&
    num(get(st, 'fontSizing', 'node')) &&
    num(get(st, 'fontSizing', 'link')) &&
    num(get(st, 'panel', 'panelSize', 'width')) &&
    num(get(st, 'panel', 'panelSize', 'height')) &&
    num(get(st, 'panel', 'offset', 'x')) &&
    num(get(st, 'panel', 'offset', 'y')) &&
    num(get(st, 'panel', 'zoomScale')) &&
    str(get(st, 'panel', 'backgroundColor')) &&
    get(st, 'panel', 'grid') &&
    num(get(st, 'tooltip', 'fontSize')) &&
    num(get(st, 'scale', 'position', 'x')) &&
    num(get(st, 'scale', 'position', 'y')) &&
    num(get(st, 'scale', 'size', 'width')) &&
    num(get(st, 'scale', 'size', 'height')) &&
    num(get(st, 'scale', 'fontSizing', 'title')) &&
    num(get(st, 'scale', 'fontSizing', 'threshold'))
  );
}

export function handleVersionedStateUpdates(wm: Weathermap, theme: GrafanaTheme2): Weathermap {
  const modelWeathermap: Weathermap = {
    version: CURRENT_VERSION,
    id: '',
    nodes: [],
    links: [],
    scale: [],
    settings: {
      link: {
        spacing: {
          horizontal: 10,
          vertical: 5,
        },
        stroke: {
          color: theme.colors.secondary.main,
        },
        label: {
          background: theme.colors.secondary.main,
          border: theme.colors.secondary.border,
          font: theme.colors.secondary.contrastText,
        },
        showAllWithPercentage: false,
        valueMappingMode: 'last',
      },
      fontSizing: {
        node: 10,
        link: 7,
      },
      panel: {
        backgroundColor: theme.colors.background.primary,
        showTimestamp: true,
        panelSize: {
          width: 600,
          height: 600,
        },
        zoomScale: 0,
        offset: {
          x: 0,
          y: 0,
        },
        grid: {
          enabled: false,
          size: 10,
          guidesEnabled: false,
        },
      },
      tooltip: {
        fontSize: 9,
        textColor: 'white',
        backgroundColor: theme.colors.background.canvas,
        inboundColor: '#00cf00',
        outboundColor: '#fade2a',
        scaleToBandwidth: false,
      },
      scale: {
        position: {
          x: 0,
          y: 0,
        },
        size: {
          width: 50,
          height: 200,
        },
        title: 'Traffic Load',
        fontSizing: {
          title: 16,
          threshold: 12,
        },
      },
    },
  };

  // Work on a shallow copy: this runs during render (panel and editor), so
  // the incoming saved options object must never be mutated.
  const migrated: Weathermap = { ...wm };
  migrated.version = CURRENT_VERSION;
  migrated.nodes = (wm.nodes ?? []).map((n) => merge(generateBasicNode('Node A', [200, 300], theme), n));
  migrated.links = (wm.links ?? []).map((l) => merge(generateBasicLink(), l));
  if (!(migrated.scale instanceof Array)) {
    const oldScale = (migrated.scale ?? {}) as unknown as Record<string, string>;
    migrated.scale = Object.keys(oldScale).map((key: string) => {
      return {
        percent: Number(key),
        color: oldScale[key],
      };
    });
  }
  return merge(modelWeathermap, migrated);
}

// Traffic-flow animation mapping (#273). Symbolic scaling, not per-packet:
// sqrt easing keeps low traffic visible without letting high traffic race.
// Constants are referenced by the docs and demo dashboard — keep them named.
export const ANIMATION_BASE_SPEED_PX_S = 20;
export const ANIMATION_SPEED_RANGE_PX_S = 100;
export const ANIMATION_MAX_EXTRA_DOTS = 7;

/** Clamp a utilization ratio into [0, 1]; non-finite resolves to 0. */
export function clampUtilization(utilization: number): number {
  if (!Number.isFinite(utilization) || utilization <= 0) {
    return 0;
  }
  return Math.min(1, utilization);
}

/** Dot speed in px/s for a utilization ratio. 0 = do not animate. */
export function utilizationToSpeed(utilization: number): number {
  const u = clampUtilization(utilization);
  if (u === 0) {
    return 0;
  }
  return ANIMATION_BASE_SPEED_PX_S + Math.sqrt(u) * ANIMATION_SPEED_RANGE_PX_S;
}

/** Number of dots for a utilization ratio. 0 = do not animate. */
export function utilizationToDotCount(utilization: number): number {
  const u = clampUtilization(utilization);
  if (u === 0) {
    return 0;
  }
  return 1 + Math.round(u * ANIMATION_MAX_EXTRA_DOTS);
}

/**
 * Returns the first numeric field in a data frame, falling back to fields[1].
 * Non-standard datasources (Check MK, etc.) may not put the value at index 1 —
 * they may omit the time field, reorder fields, or return table-style frames.
 */
export function getValueField(frame: DataFrame): Field {
  const numeric = frame.fields.find((f) => f.type === FieldType.number);
  if (numeric) {
    return numeric;
  }
  // Fallback: use fields[1] for time-series frames (time at 0, value at 1)
  if (frame.fields.length >= 2) {
    return frame.fields[1];
  }
  throw new Error(`No value field found in frame "${frame.name}"`);
}

// Find the time field of a data frame (used by the timeline slider). Prefers a
// FieldType.time field; only falls back to the first field when it is numeric
// (epoch-ms style), never to a string/category/unrelated field.
export function getTimeField(frame: DataFrame): Field | undefined {
  const timeField = frame.fields.find((f) => f.type === FieldType.time);
  if (timeField) {
    return timeField;
  }
  const first = frame.fields[0];
  if (first && first.type === FieldType.number) {
    return first;
  }
  return undefined;
}

/**
 * Resolve the value of a series at a specific point in time (timeline slider).
 * Uses a step-hold: returns the value of the most recent sample at or before
 * `timeMs`. Times are assumed ascending. Null/NaN samples are skipped (walking
 * backwards to the previous valid one) and negatives are clamped to 0, matching
 * the panel's throughput handling. Returns 0 when there is no usable value.
 */
export function valueAtTime(
  times: Array<number | null | undefined> | null | undefined,
  values: Array<number | null | undefined> | null | undefined,
  timeMs: number
): number {
  const raw = sampleAtTime(times, values, timeMs);
  return raw === undefined ? 0 : Math.max(0, raw);
}

/**
 * Raw step-hold sample at a point in time: same walk as valueAtTime (most
 * recent valid sample at or before timeMs, null/NaN skipped backwards) but
 * without the throughput-specific negative clamp and 0 default. Used for
 * node status (#201), where negative values are legitimate mapping inputs
 * and "no usable sample" must stay distinguishable from a real 0.
 */
export function sampleAtTime(
  times: Array<number | null | undefined> | null | undefined,
  values: Array<number | null | undefined> | null | undefined,
  timeMs: number
): number | undefined {
  if (!times || !values || times.length === 0) {
    return undefined;
  }

  // Index of the most recent sample at or before timeMs.
  let idx = -1;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    if (t == null) {
      continue;
    }
    if (t <= timeMs) {
      idx = i;
    } else {
      break;
    }
  }
  // Before the first sample: fall back to the first available point.
  if (idx === -1) {
    idx = 0;
  }

  for (let i = idx; i >= 0; i--) {
    const v = values[i];
    if (v !== null && v !== undefined && !isNaN(v)) {
      return v;
    }
  }
  return undefined;
}

/**
 * All bindable value series in a frame (#260). Most datasources return one
 * numeric field per frame, but wide frames (Zabbix data alignment, Grafana
 * join transformations, SQL wide mode) carry many named value fields — each
 * one is a bindable series keyed by its own field display name. For
 * single-value frames this yields exactly getDataFrameName's result.
 */
export function getValueSeries(frame: DataFrame, allFrames: DataFrame[]): Array<{ name: string; field: Field }> {
  const numeric = frame.fields.filter((f) => f.type === FieldType.number);
  if (numeric.length === 0) {
    // Same fallback as getValueField: time-series frames carry the value at
    // index 1 even when a non-standard datasource leaves the type unset.
    if (frame.fields.length >= 2) {
      const fallback = frame.fields[1];
      return [{ name: getFieldDisplayName(fallback, frame, allFrames), field: fallback }];
    }
    throw new Error(`No value field found in frame "${frame.name}"`);
  }
  return numeric.map((field) => ({ name: getFieldDisplayName(field, frame, allFrames), field }));
}

export const getDataFrameName = (frame: DataFrame, allFrames: DataFrame[]): string => {
  return getFieldDisplayName(getValueField(frame), frame, allFrames);
};

/** A select option for picking one of the panel's query result frames. */
export interface QueryOption {
  value: string;
  label: string;
}

/**
 * Display names at or below this length are shown in dropdowns verbatim —
 * longer Grafana disambiguation strings fall back to a concise form (#49).
 */
const QUERY_LABEL_MAX_VERBATIM = 60;

/**
 * Build the options for the query-picker dropdowns.
 *
 * The stored value is always the frame's full display name (what the panel
 * matches series by), so existing configs keep working. The visible label
 * balances two failure modes:
 *  - Long disambiguation strings made dropdowns unreadable (#49), so long
 *    names are shortened to "refId: fieldName" — but only while that stays
 *    unique.
 *  - One query returning many series gave every frame the same "A: Value"
 *    concise label (#191), so when concise labels collide the full display
 *    name (with its distinguishing label set) is used instead.
 */
export const buildQueryOptions = (frames: DataFrame[]): QueryOption[] => {
  const seenNames = new Set<string>();
  const entries: Array<{ value: string; concise: string }> = [];
  for (const d of frames) {
    if (d.fields.length < 2) {
      continue;
    }
    try {
      // Wide frames carry one bindable series per value field (#260).
      for (const { name, field } of getValueSeries(d, frames)) {
        if (seenNames.has(name)) {
          continue;
        }
        seenNames.add(name);
        const fieldName = field.name || name;
        const concise = d.refId ? `${d.refId}: ${fieldName}` : fieldName;
        entries.push({ value: name, concise });
      }
    } catch (e) {
      console.warn('Network Weathermap: Error while attempting to access query data.', e);
    }
  }

  const conciseCounts = new Map<string, number>();
  for (const e of entries) {
    conciseCounts.set(e.concise, (conciseCounts.get(e.concise) ?? 0) + 1);
  }

  return entries.map((e) => {
    if (e.value.length <= QUERY_LABEL_MAX_VERBATIM) {
      return { value: e.value, label: e.value };
    }
    const conciseIsUnique = conciseCounts.get(e.concise) === 1;
    return { value: e.value, label: conciseIsUnique ? e.concise : e.value };
  });
};

/**
 * The display name the ORIGINAL knightss27-weathermap-panel stored for a
 * frame: getFieldDisplayName of fields[1], computed without allFrames. This
 * fork changed both parts — the value field is now the first numeric field
 * (getValueField) and allFrames is passed so Grafana disambiguates duplicate
 * names with refId/labels — so query bindings saved by the old plugin no
 * longer match any current name (#331).
 */
export function getLegacyDataFrameName(frame: DataFrame): string | undefined {
  if (frame.fields.length < 2) {
    return undefined;
  }
  return getFieldDisplayName(frame.fields[1], frame);
}

/**
 * Map of legacy (old-plugin) display names -> the current name of the same
 * frame's primary value series (#331). An alias is only produced when it is
 * unambiguous in BOTH directions: the legacy name resolves to exactly one
 * current name, does not collide with any name the current scheme produces
 * (a legacy name that equals a live name must never redirect it), and its
 * target identifies exactly one live series (dataFrameMap resolves duplicate
 * names first-match, so redirecting onto a duplicated name would silently
 * bind a different series than the frame the alias came from).
 */
export function buildLegacyNameAliases(frames: DataFrame[]): Map<string, string> {
  const currentNameCounts = new Map<string, number>();
  const legacyTargets = new Map<string, Set<string>>();

  for (const frame of frames) {
    if (frame.fields.length < 2) {
      continue;
    }
    try {
      for (const { name } of getValueSeries(frame, frames)) {
        currentNameCounts.set(name, (currentNameCounts.get(name) ?? 0) + 1);
      }
      const legacy = getLegacyDataFrameName(frame);
      if (legacy) {
        const targets = legacyTargets.get(legacy) ?? new Set<string>();
        targets.add(getDataFrameName(frame, frames));
        legacyTargets.set(legacy, targets);
      }
    } catch (e) {
      // Frames without a usable value field can't be bound either way.
    }
  }

  const aliases = new Map<string, string>();
  legacyTargets.forEach((targets, legacy) => {
    if (targets.size !== 1 || currentNameCounts.has(legacy)) {
      return;
    }
    const target = targets.values().next().value!;
    if (currentNameCounts.get(target) === 1) {
      aliases.set(legacy, target);
    }
  });
  return aliases;
}

/** Every query-binding string stored in a weathermap, in a stable order. */
function collectQueryBindings(wm: Weathermap): Array<string | undefined> {
  const bindings: Array<string | undefined> = [];
  for (const link of wm.links) {
    for (const side of ['A', 'Z'] as const) {
      bindings.push(link.sides[side].query, link.sides[side].bandwidthQuery);
    }
    bindings.push(link.statusQuery);
    for (const metric of link.tooltipMetrics ?? []) {
      bindings.push(metric.queryA, metric.queryZ);
    }
  }
  for (const node of wm.nodes) {
    bindings.push(node.statusQuery);
    for (const metric of node.tooltipMetrics ?? []) {
      bindings.push(metric.query);
    }
  }
  return bindings;
}

/**
 * Rewrite query bindings saved by the original knightss27 plugin to the names
 * this fork computes for the same frames (#331). Returns a rewritten copy when
 * anything changed, or null when every stored name already resolves (the
 * steady state, and the fast path on every data refresh). Only names that
 * currently resolve to nothing and unambiguously match a legacy name are
 * touched, so template-variable queries and working bindings pass through
 * untouched. The steady state (nothing to rewrite) is detected on the
 * original object — no clone or traversal allocation on ordinary refreshes,
 * even for datasources whose legacy and current names permanently differ.
 */
export function rebindLegacyQueryNames(wm: Weathermap, frames: DataFrame[]): Weathermap | null {
  const aliases = buildLegacyNameAliases(frames);
  if (aliases.size === 0) {
    return null;
  }
  if (!collectQueryBindings(wm).some((stored) => stored !== undefined && aliases.has(stored))) {
    return null;
  }

  const remap = (stored: string | undefined): string | undefined =>
    stored !== undefined && aliases.has(stored) ? aliases.get(stored) : stored;

  const copy: Weathermap = JSON.parse(JSON.stringify(wm));
  for (const link of copy.links) {
    for (const side of ['A', 'Z'] as const) {
      link.sides[side].query = remap(link.sides[side].query);
      link.sides[side].bandwidthQuery = remap(link.sides[side].bandwidthQuery);
    }
    link.statusQuery = remap(link.statusQuery);
    for (const metric of link.tooltipMetrics ?? []) {
      metric.queryA = remap(metric.queryA);
      metric.queryZ = remap(metric.queryZ);
    }
  }
  for (const node of copy.nodes) {
    node.statusQuery = remap(node.statusQuery);
    for (const metric of node.tooltipMetrics ?? []) {
      metric.query = remap(metric.query);
    }
  }
  return copy;
}

/**
 * Schemes that are explicitly unsafe for navigation or resource loading.
 * Any absolute URL must use http:// or https:// — everything else is rejected.
 */
const ALLOWED_ABSOLUTE_SCHEMES = ['http:', 'https:'];

/**
 * Determine whether a user-provided URL is safe to navigate to or render.
 *
 * Safe values are:
 *  - Relative Grafana paths (no scheme), e.g. `/d/abc/my-dashboard` or
 *    `public/plugins/tamirsuliman-weathermap-panel/icons/router.svg`
 *  - Absolute URLs using the http:// or https:// scheme
 *
 * Everything else — including `javascript:`, `data:`, `file:`, `vbscript:`,
 * `blob:`, protocol-relative `//host` URLs, and any other scheme — is rejected.
 *
 * @param raw the user-provided URL
 * @returns true if the value is safe to use
 */
export function isSafeUrl(raw: string | undefined | null): boolean {
  if (raw == null) {
    return false;
  }

  // Strip leading/trailing whitespace and any control characters (including
  // tabs and newlines) that could be used to obfuscate a scheme such as
  // `java\nscript:alert(1)`.
  // eslint-disable-next-line no-control-regex
  const value = raw.replace(/[\u0000-\u001F\u007F ]/g, '').trim();

  if (value === '') {
    return false;
  }

  // Reject protocol-relative URLs (`//evil.com`) which inherit the current
  // page scheme and can point anywhere.
  if (value.startsWith('//')) {
    return false;
  }

  // Detect an explicit scheme. A leading scheme looks like `name:` where name
  // starts with a letter followed by letters, digits, `+`, `-`, or `.`.
  const schemeMatch = value.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);

  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase() + ':';
    return ALLOWED_ABSOLUTE_SCHEMES.includes(scheme);
  }

  // No scheme present — treat as a relative Grafana path, which is safe.
  return true;
}

/**
 * Sanitize a user-provided URL. Returns the cleaned value when it is safe to
 * use, or an empty string when it is not. This is applied both when a value is
 * entered/saved in the editor and again at the point of use (navigation or
 * image rendering) for defense in depth.
 *
 * @param raw the user-provided URL
 * @returns the trimmed URL when safe, otherwise an empty string
 */
export function sanitizeUrl(raw: string | undefined | null): string {
  if (raw == null) {
    return '';
  }

  const trimmed = raw.trim();
  return isSafeUrl(trimmed) ? trimmed : '';
}

/**
 * Insert a VIA (intermediate waypoint) into a link by the connection-node
 * mechanism: the link A<->B is split into A<->C and C<->B, where C is a new
 * connection node placed at the link's midpoint. The A-side query/data stays on
 * the first segment and the B-side query/data moves to the second, so metrics
 * are preserved. Returns the (mutated) weathermap; a no-op if the link is
 * missing. The caller can then drag C to reposition the VIA.
 */
export function addViaToLink(wm: Weathermap, linkId: string, theme: GrafanaTheme2): Weathermap {
  const link = wm.links.find((l) => l.id === linkId);
  if (!link) {
    return wm;
  }

  const aPos = link.nodes[0].position;
  const bPos = link.nodes[1].position;
  const midpoint: [number, number] = [Math.round((aPos[0] + bPos[0]) / 2), Math.round((aPos[1] + bPos[1]) / 2)];

  const connCount = wm.nodes.filter((n) => n.isConnection).length;
  const conn: Node = {
    ...generateBasicNode('C' + connCount, midpoint, theme),
    isConnection: true,
    anchors: {
      0: { numLinks: 2, numFilledLinks: 0 },
      1: { numLinks: 0, numFilledLinks: 0 },
      2: { numLinks: 0, numFilledLinks: 0 },
      3: { numLinks: 0, numFilledLinks: 0 },
      4: { numLinks: 0, numFilledLinks: 0 },
    },
  };

  const endNode = link.nodes[1];
  const zSide = link.sides.Z; // carries the B-side query/bandwidth/labels

  const connectionSide = (labelOffset: number): typeof link.sides.A => ({
    bandwidth: 0,
    bandwidthQuery: undefined,
    query: undefined,
    labelOffset,
    anchor: Anchor.Center,
    dashboardLink: '',
  });

  // New link C <-> B keeps all link-level properties (units, arrows, stroke,
  // status, tooltip metrics, etc.) and the original B-side data.
  const newLink: Link = {
    ...link,
    id: uuidv4(),
    nodes: [conn, endNode],
    sides: {
      A: connectionSide(zSide.labelOffset),
      Z: zSide,
    },
  };

  // Original link becomes A <-> C; its A-side data is untouched.
  link.nodes = [link.nodes[0], conn];
  link.sides = {
    A: link.sides.A,
    Z: connectionSide(zSide.labelOffset),
  };

  wm.nodes.push(conn);
  const idx = wm.links.findIndex((l) => l.id === linkId);
  wm.links.splice(idx + 1, 0, newLink);
  return wm;
}

/**
 * Remove a VIA connection node, merging its incoming (A<->C) and outgoing
 * (C<->B) links back into a single A<->B link that keeps the endpoint data.
 * No-op unless the node is a connection with exactly one incoming and one
 * outgoing link (so malformed graphs are left untouched).
 */
export function removeVia(wm: Weathermap, connectionNodeId: string): Weathermap {
  const conn = wm.nodes.find((n) => n.id === connectionNodeId && n.isConnection);
  if (!conn) {
    return wm;
  }

  const inLinks = wm.links.filter((l) => l.nodes[1].id === conn.id);
  const outLinks = wm.links.filter((l) => l.nodes[0].id === conn.id);
  // Require exactly one distinct incoming and one distinct outgoing link. A
  // C->C self-loop would satisfy the length check with the same link on both
  // sides, so reject that too and stay a no-op on malformed data.
  if (inLinks.length !== 1 || outLinks.length !== 1 || inLinks[0].id === outLinks[0].id) {
    return wm;
  }

  const inLink = inLinks[0];
  const outLink = outLinks[0];

  // inLink (A<->C) now reaches outLink's target (B), keeping B-side data.
  inLink.nodes = [inLink.nodes[0], outLink.nodes[1]];
  inLink.sides = { A: inLink.sides.A, Z: outLink.sides.Z };

  wm.links = wm.links.filter((l) => l.id !== outLink.id);
  wm.nodes = wm.nodes.filter((n) => n.id !== conn.id);
  return wm;
}

/**
 * Resolve a single display value from a field's data points according to the
 * chosen value-mapping mode. Null/NaN entries are skipped and negative values
 * are clamped to 0 (matching how the panel treats throughput). Returns 0 when
 * there are no valid data points.
 *
 * - last: the most recent valid value (default, original behaviour)
 * - avg:  arithmetic mean of the valid values
 * - min:  smallest valid value
 * - max:  largest valid value
 * - p95:  95th percentile (nearest-rank) of the valid values
 */
export function aggregateFieldValues(
  values: Array<number | null | undefined> | null | undefined,
  mode: ValueMappingMode | undefined
): number {
  if (!values || values.length === 0) {
    return 0;
  }

  const valid: number[] = [];
  let lastValid = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null && v !== undefined && !isNaN(v)) {
      const clamped = Math.max(0, v);
      valid.push(clamped);
      lastValid = clamped;
    }
  }

  if (valid.length === 0) {
    return 0;
  }

  switch (mode) {
    case 'avg': {
      let sum = 0;
      for (const v of valid) {
        sum += v;
      }
      return sum / valid.length;
    }
    case 'min': {
      let m = valid[0];
      for (const v of valid) {
        if (v < m) {
          m = v;
        }
      }
      return m;
    }
    case 'max': {
      let m = valid[0];
      for (const v of valid) {
        if (v > m) {
          m = v;
        }
      }
      return m;
    }
    case 'p95': {
      const sorted = [...valid].sort((a, b) => a - b);
      // Nearest-rank method: smallest value >= 95% of the data.
      const rank = Math.ceil(0.95 * sorted.length);
      const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
      return sorted[idx];
    }
    case 'last':
    default:
      return lastValid;
  }
}

/**
 * Resolve the full VIA chain a link belongs to (#179): starting from one link,
 * walk backward through connection-node sources and forward through
 * connection-node targets, collecting every segment of the logical link.
 * Returns the set of link ids in the chain (always includes the given link).
 */
export function resolveLinkChain(links: Link[], linkId: string): Set<string> {
  const chain = new Set<string>([linkId]);
  const byId = new Map(links.map((l) => [l.id, l]));
  const start = byId.get(linkId);
  if (!start) {
    return chain;
  }

  // Index segments by their endpoint node ids once, so each hop of the chain
  // walk is a map lookup instead of a scan (keeps hover-time resolution
  // linear on dense maps).
  const bySourceNode = new Map<string, Link[]>();
  const byTargetNode = new Map<string, Link[]>();
  for (const l of links) {
    if (l.nodes[0]?.id) {
      const list = bySourceNode.get(l.nodes[0].id) ?? [];
      list.push(l);
      bySourceNode.set(l.nodes[0].id, list);
    }
    if (l.nodes[1]?.id) {
      const list = byTargetNode.get(l.nodes[1].id) ?? [];
      list.push(l);
      byTargetNode.set(l.nodes[1].id, list);
    }
  }

  // Walk backward: while the current segment starts at a connection node,
  // include the segment feeding that connection.
  let current: Link | undefined = start;
  for (let guard = 0; guard < links.length && current && current.nodes[0]?.isConnection; guard++) {
    const prev: Link | undefined = (byTargetNode.get(current.nodes[0].id) ?? []).find((l) => l.id !== current!.id);
    if (!prev || chain.has(prev.id)) {
      break;
    }
    chain.add(prev.id);
    current = prev;
  }

  // Walk forward: while the current segment ends at a connection node,
  // include the segment leaving that connection.
  current = start;
  for (let guard = 0; guard < links.length && current && current.nodes[1]?.isConnection; guard++) {
    const next: Link | undefined = (bySourceNode.get(current.nodes[1].id) ?? []).find((l) => l.id !== current!.id);
    if (!next || chain.has(next.id)) {
      break;
    }
    chain.add(next.id);
    current = next;
  }

  return chain;
}

export interface LabelPlacement {
  key: string;
  // The segment the label slides along, and its preferred position (percent).
  segment: { x1: number; y1: number; x2: number; y2: number };
  offsetPercent: number;
  width: number;
  height: number;
}

const labelBoxAt = (l: LabelPlacement, pct: number) => {
  const x = l.segment.x1 + ((l.segment.x2 - l.segment.x1) * pct) / 100;
  const y = l.segment.y1 + ((l.segment.y2 - l.segment.y1) * pct) / 100;
  return { x0: x - l.width / 2, y0: y - l.height / 2, x1: x + l.width / 2, y1: y + l.height / 2 };
};

const boxesOverlap = (a: ReturnType<typeof labelBoxAt>, b: ReturnType<typeof labelBoxAt>) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * Greedy label de-overlap pass (#179): keeps each label on its own link
 * segment, nudging its offset percentage away from already-placed labels.
 * Returns the resolved offset percent per label key; labels that cannot be
 * de-overlapped within the segment keep their preferred position.
 */
export function spreadLabels(labels: LabelPlacement[], step = 8, min = 10, max = 90): Map<string, number> {
  const placed: Array<ReturnType<typeof labelBoxAt>> = [];
  const result = new Map<string, number>();

  for (const label of labels) {
    let chosen = label.offsetPercent;
    let found = false;
    // Try the preferred spot, then alternate outward: +step, -step, +2step, ...
    for (let k = 0; k <= Math.ceil((max - min) / step); k++) {
      for (const dir of k === 0 ? [0] : [1, -1]) {
        const pct = label.offsetPercent + dir * k * step;
        if (pct < min || pct > max) {
          continue;
        }
        const box = labelBoxAt(label, pct);
        if (!placed.some((p) => boxesOverlap(box, p))) {
          chosen = pct;
          found = true;
          break;
        }
      }
      if (found) {
        break;
      }
    }
    placed.push(labelBoxAt(label, chosen));
    result.set(label.key, chosen);
  }

  return result;
}
