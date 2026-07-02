#!/usr/bin/env node
/*
 * Generates the scenario demo dashboards in testing/grafana/dashboards/.
 *
 * All four dashboards share one simulated WAN topology, fed by the metrics in
 * testing/exporter/main.go (wm_link_bps, wm_device_status, wm_latency_ms,
 * wm_packet_loss_pct, wm_link_errors, wm_link_discards). Each dashboard tells
 * a different story:
 *
 *   wan-utilization   — live utilization, direction/port labels, parallel core
 *                       links, VIA-curved long-haul link, percent color scale
 *   device-health     — node status coloring: SITE-DFW flaps down, packet-loss
 *                       threshold mappings color the other devices
 *   capacity-planning — 95th-percentile display mode; SITE-ATL's periodically
 *                       saturating link shows where capacity runs out
 *   incident-replay   — timeline slider on; scrub back to replay the SITE-DFW
 *                       outage (traffic collapse + device down)
 *
 * Node/link objects follow the current options schema (src/types.ts, v14) —
 * unlike all_dashboards.json, which intentionally stays in the legacy pre-v14
 * format as the migration regression fixture.
 *
 * Regenerate with: node testing/scripts/generate-scenario-dashboards.js
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'grafana', 'dashboards');
const VERSION = 14; // CURRENT_VERSION in src/utils.ts

// Anchor enum from src/types.ts
const A = { Center: 0, Top: 1, Bottom: 2, Left: 3, Right: 4 };

// ---------------------------------------------------------------------------
// Topology (mirrors simLinks/simDevices in testing/exporter/main.go)
// ---------------------------------------------------------------------------

const DEVICES = {
  'CORE-A': { pos: [300, 170] },
  'CORE-B': { pos: [560, 170] },
  'EDGE-1': { pos: [220, 330] },
  'EDGE-2': { pos: [640, 330] },
  'SITE-ATL': { pos: [120, 480] },
  'SITE-DFW': { pos: [330, 480] },
  'SITE-NYC': { pos: [640, 500] },
  INET: { pos: [640, 60] },
};

// via: position of a connection node that curves the link.
const LINKS = [
  { id: 'core-a<->core-b/1', a: 'CORE-A', z: 'CORE-B', iface: 'Eth-Trunk1', cap: 10e9, aAnchor: A.Right, zAnchor: A.Left },
  { id: 'core-a<->core-b/2', a: 'CORE-A', z: 'CORE-B', iface: 'Eth-Trunk2', cap: 10e9, aAnchor: A.Right, zAnchor: A.Left },
  { id: 'core-a<->edge-1', a: 'CORE-A', z: 'EDGE-1', iface: 'HundredGigE0/0/1', cap: 10e9, aAnchor: A.Bottom, zAnchor: A.Top },
  { id: 'core-b<->edge-2', a: 'CORE-B', z: 'EDGE-2', iface: 'HundredGigE0/0/2', cap: 10e9, aAnchor: A.Bottom, zAnchor: A.Top },
  { id: 'edge-1<->site-atl', a: 'EDGE-1', z: 'SITE-ATL', iface: 'GigabitEthernet0/1', cap: 1e9, aAnchor: A.Bottom, zAnchor: A.Top },
  { id: 'edge-1<->site-dfw', a: 'EDGE-1', z: 'SITE-DFW', iface: 'GigabitEthernet0/2', cap: 1e9, aAnchor: A.Bottom, zAnchor: A.Top },
  { id: 'edge-2<->site-nyc', a: 'EDGE-2', z: 'SITE-NYC', iface: 'GigabitEthernet0/3', cap: 1e9, aAnchor: A.Bottom, zAnchor: A.Top, via: [760, 420] },
  { id: 'core-b<->inet', a: 'CORE-B', z: 'INET', iface: 'HundredGigE0/0/9', cap: 10e9, aAnchor: A.Top, zAnchor: A.Bottom },
];

// Frame names produced by the Prometheus targets' legendFormat below.
const frameTx = (l) => `${l.id} tx`;
const frameRx = (l) => `${l.id} rx`;
const frameStatus = (d) => `STATUS ${d}`;
const frameLatency = (d) => `LAT ${d}`;
const frameLoss = (d) => `LOSS ${d}`;
const frameErr = (l) => `ERR ${l.id}`;
const frameDisc = (l) => `DISC ${l.id}`;

// ---------------------------------------------------------------------------
// Weathermap object builders (schema: src/types.ts)
// ---------------------------------------------------------------------------

const emptyAnchors = () => ({
  0: { numLinks: 0, numFilledLinks: 0 },
  1: { numLinks: 0, numFilledLinks: 0 },
  2: { numLinks: 0, numFilledLinks: 0 },
  3: { numLinks: 0, numFilledLinks: 0 },
  4: { numLinks: 0, numFilledLinks: 0 },
});

function makeNode(name, opts = {}) {
  return {
    id: `node-${name.toLowerCase()}`,
    position: DEVICES[name].pos,
    label: name,
    showLabel: true,
    anchors: emptyAnchors(),
    useConstantSpacing: false,
    compactVerticalLinks: false,
    padding: { vertical: 6, horizontal: 12 },
    colors: {
      font: '#ffffff',
      background: '#22252b',
      border: '#5794F2',
      statusDown: '#F2495C',
    },
    nodeIcon: {
      src: '',
      name: '',
      size: { width: 0, height: 0 },
      padding: { vertical: 0, horizontal: 0 },
      drawInside: false,
    },
    isConnection: false,
    ...opts,
  };
}

function makeConnection(id, position) {
  return {
    ...makeNode('INET', { id, position, label: '', showLabel: false }),
    isConnection: true,
  };
}

const side = (opts) => ({
  bandwidth: 0,
  bandwidthQuery: undefined,
  query: undefined,
  labelOffset: 55,
  anchor: A.Center,
  dashboardLink: '',
  ...opts,
});

function makeLink(id, nodeA, nodeZ, sideA, sideZ, opts = {}) {
  return {
    id,
    nodes: [nodeA, nodeZ],
    sides: { A: side(sideA), Z: side(sideZ) },
    units: 'bps',
    arrows: { width: 8, height: 10, offset: 2 },
    stroke: 6,
    showThroughputPercentage: false,
    ...opts,
  };
}

// Builds nodes + links for the shared topology. Options let each scenario
// tune what is wired up.
function buildTopology({ statusFrames = 'updown', withTooltipMetrics = true, directionLabels = true, showPercent = false }) {
  const nodes = {};
  for (const name of Object.keys(DEVICES)) {
    const opts = {};
    if (withTooltipMetrics) {
      opts.tooltipMetrics = [
        { label: 'Latency', query: frameLatency(name), units: 'ms' },
        { label: 'Packet Loss', query: frameLoss(name), units: 'percent' },
      ];
    }
    if (statusFrames === 'updown') {
      // wm_device_status is 1/0; the default "< 1 = down" rule applies.
      opts.statusQuery = frameStatus(name);
      opts.nodeStatusColorTarget = 'both';
    } else if (statusFrames === 'loss') {
      // Packet loss with threshold mappings: green under 1%, orange 1-50%, red above.
      opts.statusQuery = frameLoss(name);
      opts.nodeStatusColorTarget = 'both';
      opts.statusValueMappings = [
        { value: 0, color: '#73BF69' },
        { value: 1, color: '#FF9830' },
        { value: 50, color: '#F2495C' },
      ];
    }
    nodes[name] = makeNode(name, opts);
  }

  const links = [];
  const connections = [];

  for (const l of LINKS) {
    const nodeA = nodes[l.a];
    const nodeZ = nodes[l.z];

    const sideA = {
      bandwidth: l.cap,
      query: frameTx(l),
      anchor: l.aAnchor,
      portLabel: l.iface,
      ...(directionLabels ? { directionLabel: 'Out' } : {}),
    };
    const sideZ = {
      bandwidth: l.cap,
      query: frameRx(l),
      anchor: l.zAnchor,
      ...(directionLabels ? { directionLabel: 'In' } : {}),
    };
    const linkOpts = {
      showThroughputPercentage: showPercent,
      ...(withTooltipMetrics
        ? {
            tooltipMetrics: [
              { label: 'Errors', queryA: frameErr(l), units: 'pps' },
              { label: 'Discards', queryA: frameDisc(l), units: 'pps' },
            ],
          }
        : {}),
    };

    if (l.via) {
      // Split the link through a connection node, exactly as the editor's
      // "add VIA" does: A-side data on the first half, Z-side data on the second.
      const conn = makeConnection(`conn-${l.id}`, l.via);
      conn.anchors[A.Center].numLinks = 2;
      connections.push(conn);
      links.push(
        makeLink(`link-${l.id}/a`, nodeA, conn, sideA, { anchor: A.Center }, linkOpts),
        makeLink(`link-${l.id}/z`, conn, nodeZ, { anchor: A.Center }, sideZ, linkOpts)
      );
      nodeA.anchors[l.aAnchor].numLinks++;
      nodeZ.anchors[l.zAnchor].numLinks++;
      continue;
    }

    links.push(makeLink(`link-${l.id}`, nodeA, nodeZ, sideA, sideZ, linkOpts));
    nodeA.anchors[l.aAnchor].numLinks++;
    nodeZ.anchors[l.zAnchor].numLinks++;
  }

  return { nodes: [...Object.values(nodes), ...connections], links };
}

function makeWeathermap(id, topology, settingsOverrides = {}) {
  const base = {
    version: VERSION,
    id,
    nodes: topology.nodes,
    links: topology.links,
    scale: [
      { percent: 0, color: '#73BF69' },
      { percent: 40, color: '#FADE2A' },
      { percent: 60, color: '#FF9830' },
      { percent: 80, color: '#F2495C' },
      { percent: 95, color: '#C4162A' },
    ],
    settings: {
      link: {
        spacing: { horizontal: 10, vertical: 5 },
        stroke: { color: 'rgba(204, 204, 220, 0.16)' },
        label: {
          background: '#181b1f',
          border: 'rgba(204, 204, 220, 0.25)',
          font: 'rgb(204, 204, 220)',
        },
        showAllWithPercentage: false,
        valueMappingMode: 'last',
        defaultUnits: 'bps',
        linkDecimals: 1,
        dynamicStroke: { enabled: false, minWidth: 1, maxWidth: 10 },
        flowAnimation: { enabled: false, speed: 2 },
        gradientColor: false,
      },
      fontSizing: { node: 10, link: 8 },
      colorScaleMode: 'percent',
      panel: {
        backgroundColor: '#111217',
        showTimestamp: true,
        panelSize: { width: 900, height: 620 },
        zoomScale: 0,
        offset: { x: 0, y: 0 },
        grid: { enabled: false, size: 10, guidesEnabled: false },
      },
      tooltip: {
        fontSize: 10,
        textColor: 'white',
        backgroundColor: 'black',
        inboundColor: '#00cf00',
        outboundColor: '#fade2a',
        scaleToBandwidth: true,
      },
      scale: {
        position: { x: 0, y: 0 },
        size: { width: 60, height: 220 },
        title: 'Utilization',
        fontSizing: { title: 14, threshold: 11 },
      },
    },
  };

  // Deep-ish merge for the two settings levels the scenarios tweak.
  const merged = { ...base, settings: { ...base.settings, ...settingsOverrides } };
  if (settingsOverrides.link) {
    merged.settings.link = { ...base.settings.link, ...settingsOverrides.link };
  }
  if (settingsOverrides.scale) {
    merged.settings.scale = { ...base.settings.scale, ...settingsOverrides.scale };
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Dashboard envelope
// ---------------------------------------------------------------------------

const TARGETS = [
  { refId: 'A', expr: 'wm_link_bps', legendFormat: '{{link}} {{direction}}' },
  { refId: 'B', expr: 'wm_device_status', legendFormat: 'STATUS {{device}}' },
  { refId: 'C', expr: 'wm_latency_ms', legendFormat: 'LAT {{device}}' },
  { refId: 'D', expr: 'wm_packet_loss_pct', legendFormat: 'LOSS {{device}}' },
  { refId: 'E', expr: 'wm_link_errors', legendFormat: 'ERR {{link}}' },
  { refId: 'F', expr: 'wm_link_discards', legendFormat: 'DISC {{link}}' },
].map((t) => ({ ...t, exemplar: false, instant: false, range: true, interval: '', format: 'time_series' }));

function makeDashboard({ uid, title, description, weathermap, refresh = '10s', timeFrom = 'now-1h' }) {
  return {
    annotations: { list: [] },
    editable: true,
    graphTooltip: 0,
    links: [],
    refresh,
    schemaVersion: 39,
    tags: ['weathermap-demo'],
    templating: { list: [] },
    time: { from: timeFrom, to: 'now' },
    timepicker: {},
    timezone: '',
    title,
    description,
    uid,
    version: 1,
    panels: [
      {
        datasource: 'Prometheus',
        gridPos: { h: 22, w: 24, x: 0, y: 0 },
        id: 1,
        title,
        type: 'tamirsuliman-weathermap-panel',
        targets: TARGETS,
        options: { weathermap },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

const dashboards = [
  makeDashboard({
    uid: 'wm-wan-utilization',
    title: 'WAN Demo — Utilization',
    description:
      'Live WAN utilization: parallel core links, VIA-curved long-haul to SITE-NYC, direction and port labels, percent color scale. Data is simulated by testing/exporter.',
    weathermap: makeWeathermap(
      'wm-wan-utilization',
      buildTopology({ statusFrames: 'updown', withTooltipMetrics: true, directionLabels: true })
    ),
  }),
  makeDashboard({
    uid: 'wm-device-health',
    title: 'WAN Demo — Device Health',
    description:
      'Node status coloring: SITE-DFW flaps down every ~10 minutes (down = red via the default <1 rule on the utilization map; here all devices are colored by packet-loss threshold mappings: green <1%, orange 1-50%, red above). Hover nodes for latency/packet-loss tooltips.',
    weathermap: makeWeathermap(
      'wm-device-health',
      buildTopology({ statusFrames: 'loss', withTooltipMetrics: true, directionLabels: false }),
      { scale: { title: 'Link Load' } }
    ),
  }),
  makeDashboard({
    uid: 'wm-capacity-planning',
    title: 'WAN Demo — Capacity Planning (p95)',
    description:
      'Link values show the 95th percentile over the selected range instead of the live value. EDGE-1 <-> SITE-ATL saturates for ~90s every 7 minutes — visible here long after the burst has passed. Throughput is displayed as percent of provisioned bandwidth.',
    weathermap: makeWeathermap(
      'wm-capacity-planning',
      buildTopology({ statusFrames: 'updown', withTooltipMetrics: true, directionLabels: false, showPercent: true }),
      {
        link: { valueMappingMode: 'p95', showAllWithPercentage: true },
        scale: { title: 'p95 Load' },
      }
    ),
    timeFrom: 'now-3h',
  }),
  makeDashboard({
    uid: 'wm-incident-replay',
    title: 'WAN Demo — Incident Replay (timeline)',
    description:
      'Timeline slider is enabled: drag it to scrub through the range and replay the SITE-DFW outage — traffic on EDGE-1 <-> SITE-DFW collapses for ~2 minutes every 10 minutes while the device status goes down.',
    weathermap: makeWeathermap(
      'wm-incident-replay',
      buildTopology({ statusFrames: 'updown', withTooltipMetrics: true, directionLabels: true }),
      {
        link: { timeline: { enabled: true } },
        scale: { title: 'Utilization' },
      }
    ),
    refresh: '30s',
  }),
];

for (const d of dashboards) {
  const file = path.join(OUT_DIR, `${d.uid}.json`);
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + '\n');
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
