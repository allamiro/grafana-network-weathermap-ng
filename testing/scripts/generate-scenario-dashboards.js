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
  'CORE-A': { pos: [300, 170], icon: 'networking/router' },
  'CORE-B': { pos: [560, 170], icon: 'networking/router' },
  'EDGE-1': { pos: [220, 330], icon: 'networking/switch' },
  'EDGE-2': { pos: [640, 330], icon: 'networking/switch' },
  'SITE-ATL': { pos: [120, 480], icon: 'networking/building' },
  'SITE-DFW': { pos: [330, 480], icon: 'networking/building' },
  'SITE-NYC': { pos: [640, 500], icon: 'networking/building' },
  INET: { pos: [640, 60], icon: 'networking/cloud' },
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

// Bundled plugin icon, referenced the same way the editor's icon picker does.
const icon = (name, size = 32) => ({
  src: `public/plugins/tamirsuliman-weathermap-panel/icons/${name}.svg`,
  name,
  size: { width: size, height: size },
  padding: { vertical: 0, horizontal: 0 },
  drawInside: false,
});

const emptyAnchors = () => ({
  0: { numLinks: 0, numFilledLinks: 0 },
  1: { numLinks: 0, numFilledLinks: 0 },
  2: { numLinks: 0, numFilledLinks: 0 },
  3: { numLinks: 0, numFilledLinks: 0 },
  4: { numLinks: 0, numFilledLinks: 0 },
});

function makeNode(name, opts = {}) {
  return {
    id: `node-${name.toLowerCase().replace(/[^a-z0-9-]/g, '')}`,
    position: opts.position ?? DEVICES[name].pos,
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
    nodeIcon: DEVICES[name]?.icon
      ? icon(DEVICES[name].icon)
      : {
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
    ...makeNode('INET', {
      id,
      position,
      label: '',
      showLabel: false,
      nodeIcon: { src: '', name: '', size: { width: 0, height: 0 }, padding: { vertical: 0, horizontal: 0 }, drawInside: false },
    }),
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
// tune what is wired up. nodeDashboardLinks maps device name -> dashboard URL
// for drill-down chains.
function buildTopology({
  statusFrames = 'updown',
  withTooltipMetrics = true,
  directionLabels = true,
  showPercent = false,
  nodeDashboardLinks = {},
}) {
  const nodes = {};
  for (const name of Object.keys(DEVICES)) {
    const opts = {};
    if (withTooltipMetrics) {
      opts.tooltipMetrics = [
        { label: 'Latency', query: frameLatency(name), units: 'ms' },
        { label: 'Packet Loss', query: frameLoss(name), units: 'percent' },
      ];
    }
    if (nodeDashboardLinks[name]) {
      opts.dashboardLink = nodeDashboardLinks[name];
      opts.openInSameTab = false;
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

  // Deep-ish merge for the settings levels the scenarios tweak.
  const merged = { ...base, settings: { ...base.settings, ...settingsOverrides } };
  for (const key of ['link', 'scale', 'panel', 'fontSizing']) {
    if (settingsOverrides[key]) {
      merged.settings[key] = { ...base.settings[key], ...settingsOverrides[key] };
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Custom scenario topologies (floor plan, global backbone, multi-hop, LAG,
// rack ports). Simple spec format:
//   nodes: { NAME: { pos, dashboardLink?, statusQuery?, mappings?, label? } }
//   links: [{ frame, a, z, cap, aAnchor?, zAnchor?, offset?, portLabel?, percent? }]
// ---------------------------------------------------------------------------

function buildCustomTopology(nodesSpec, linksSpec) {
  const nodes = {};
  for (const [name, spec] of Object.entries(nodesSpec)) {
    const opts = { position: spec.pos };
    if (spec.label !== undefined) {
      opts.label = spec.label;
    }
    if (spec.icon) {
      opts.nodeIcon = icon(spec.icon, spec.iconSize);
    }
    if (spec.dashboardLink) {
      opts.dashboardLink = spec.dashboardLink;
      opts.openInSameTab = false;
    }
    if (spec.statusQuery) {
      opts.statusQuery = spec.statusQuery;
      opts.nodeStatusColorTarget = spec.colorTarget ?? 'both';
      if (spec.mappings) {
        opts.statusValueMappings = spec.mappings;
      }
    }
    if (spec.tooltipMetrics) {
      opts.tooltipMetrics = spec.tooltipMetrics;
    }
    if (spec.padding) {
      opts.padding = spec.padding;
    }
    if (spec.colors) {
      opts.colors = spec.colors;
    }
    nodes[name] = makeNode(name, opts);
  }

  const links = [];
  const connections = [];
  for (const l of linksSpec) {
    const nodeA = nodes[l.a];
    const nodeZ = nodes[l.z];
    const aAnchor = l.aAnchor ?? A.Center;
    const zAnchor = l.zAnchor ?? A.Center;

    // Power cables carry the server's wattage on both sides.
    const sideA = l.power
      ? { anchor: aAnchor, query: l.powerQuery, bandwidth: l.cap, ...(l.aLabelOffset !== undefined ? { labelOffset: l.aLabelOffset } : {}) }
      : {
          bandwidth: l.cap,
          query: `${l.frame} tx`,
          anchor: aAnchor,
          ...(l.aLabelOffset !== undefined ? { labelOffset: l.aLabelOffset } : {}),
          ...(l.portLabel ? { portLabel: l.portLabel } : {}),
          ...(l.directionLabels ? { directionLabel: 'Out' } : {}),
        };
    const sideZ = l.power
      ? { anchor: zAnchor, query: l.powerQuery, bandwidth: l.cap, ...(l.zLabelOffset !== undefined ? { labelOffset: l.zLabelOffset } : {}) }
      : {
          bandwidth: l.cap,
          query: `${l.frame} rx`,
          anchor: zAnchor,
          ...(l.zLabelOffset !== undefined ? { labelOffset: l.zLabelOffset } : {}),
          ...(l.directionLabels ? { directionLabel: 'In' } : {}),
        };

    if (l.vias && l.vias.length > 0) {
      // Chain the link through connection nodes, as the editor's "add VIA"
      // does: A-side data on the first segment, Z-side on the last, bare
      // connection sides in between.
      const points = l.vias.map((pos, vi) => {
        const conn = makeConnection(`conn-${l.frame}-${vi}`, pos);
        conn.anchors[A.Center].numLinks = 2;
        connections.push(conn);
        return conn;
      });
      const chain = [nodeA, ...points, nodeZ];
      for (let s = 0; s < chain.length - 1; s++) {
        const first = s === 0;
        const last = s === chain.length - 2;
        links.push(
          makeLink(
            `link-${l.frame}/${s}`,
            chain[s],
            chain[s + 1],
            first ? sideA : { anchor: A.Center },
            last ? sideZ : { anchor: A.Center },
            {
              showThroughputPercentage: Boolean(l.percent),
              ...(l.stroke ? { stroke: l.stroke } : {}),
              ...(l.units ? { units: l.units } : {}),
              ...(l.arrowMeetPercent ? { arrowMeetPercent: l.arrowMeetPercent } : {}),
            }
          )
        );
      }
      nodeA.anchors[aAnchor].numLinks++;
      nodeZ.anchors[zAnchor].numLinks++;
      continue;
    }

    links.push(
      makeLink(`link-${l.frame}${l.offset ? `/${l.offset}` : ''}`, nodeA, nodeZ, sideA, sideZ, {
        showThroughputPercentage: Boolean(l.percent),
        ...(l.stroke ? { stroke: l.stroke } : {}),
        ...(l.units ? { units: l.units } : {}),
        ...(l.offset !== undefined ? { linkOffset: l.offset } : {}),
      })
    );
    nodeA.anchors[aAnchor].numLinks++;
    nodeZ.anchors[zAnchor].numLinks++;
  }

  return { nodes: [...Object.values(nodes), ...connections], links };
}

// ---------------------------------------------------------------------------
// Dashboard envelope
// ---------------------------------------------------------------------------

const targetDefaults = (t) => ({ ...t, exemplar: false, instant: false, range: true, interval: '', format: 'time_series' });

const TARGETS = [
  { refId: 'A', expr: 'wm_link_bps', legendFormat: '{{link}} {{direction}}' },
  { refId: 'B', expr: 'wm_device_status', legendFormat: 'STATUS {{device}}' },
  { refId: 'C', expr: 'wm_latency_ms', legendFormat: 'LAT {{device}}' },
  { refId: 'D', expr: 'wm_packet_loss_pct', legendFormat: 'LOSS {{device}}' },
  { refId: 'E', expr: 'wm_link_errors', legendFormat: 'ERR {{link}}' },
  { refId: 'F', expr: 'wm_link_discards', legendFormat: 'DISC {{link}}' },
].map(targetDefaults);

// Only the rack board consumes wm_port_status frames; keep the extra query
// off every other dashboard.
const PORT_STATUS_TARGET = targetDefaults({ refId: 'G', expr: 'wm_port_status', legendFormat: 'PORT {{port}}' });

// Device-qualified variant for the multi-device rack: two switches both have
// a Gi0/1, so frames must carry the device name to stay unique.
const RACK_CABLING_TARGET = targetDefaults({
  refId: 'H',
  expr: 'wm_port_status{device=~"R-RTR|R-FW|R-SW1|R-SW2|SRV-1|SRV-2|SRV-3|PDU-A|PDU-B"}',
  legendFormat: 'PORT {{device}} {{port}}',
});

const POWER_TARGET = targetDefaults({ refId: 'I', expr: 'wm_power_watts', legendFormat: 'PWR {{device}} {{feed}}' });

function makeDashboard({ uid, title, description, weathermap, refresh = '10s', timeFrom = 'now-1h', extraTargets = [] }) {
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
        targets: [...TARGETS, ...extraTargets],
        options: { weathermap },
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

// Rack port-status nodes: 24 access ports in two rows of 12 on the switch
// faceplate drawn by the exporter's /rack.svg, plus the two 10G uplinks.
function buildRackPorts() {
  const nodesSpec = {};
  const mappings = [
    { value: 0, color: '#F2495C' }, // down
    { value: 1, color: '#73BF69' }, // up
    { value: 2, color: '#55575c' }, // admin-disabled
  ];
  for (let p = 1; p <= 24; p++) {
    const row = p <= 12 ? 0 : 1;
    const col = (p - 1) % 12;
    nodesSpec[`P${p}`] = {
      label: String(p),
      pos: [212 + col * 40, 225 + row * 45],
      statusQuery: `PORT Gi1/0/${p}`,
      mappings,
      colorTarget: 'background',
      padding: { horizontal: 8, vertical: 5 },
    };
  }
  nodesSpec['T1'] = {
    label: 'T1',
    pos: [700, 225],
    statusQuery: 'PORT Te1/1/1',
    mappings,
    colorTarget: 'background',
    padding: { horizontal: 8, vertical: 5 },
  };
  nodesSpec['T2'] = {
    label: 'T2',
    pos: [700, 270],
    statusQuery: 'PORT Te1/1/2',
    mappings,
    colorTarget: 'background',
    padding: { horizontal: 8, vertical: 5 },
  };
  return buildCustomTopology(nodesSpec, []);
}


// Multi-device rack cabling (rear view): port/NIC/PSU/outlet nodes placed on
// the faceplates drawn by /rack2.svg (1000x760), network cables routed through
// the left channel, power cables to the redundant PDU-A/PDU-B strips.
function buildRackCabling() {
  const mappings = [
    { value: 0, color: '#F2495C' }, // down / outlet off
    { value: 1, color: '#73BF69' }, // up / powered
    { value: 2, color: '#55575c' }, // admin-disabled
  ];
  const pad = { horizontal: 5, vertical: 3 };
  const framePort = (dev, port) => `PORT ${dev} ${port}`;
  const nodesSpec = {};
  const port = (name, label, dev, portId, x, y) => {
    nodesSpec[name] = {
      label,
      pos: [x, y],
      statusQuery: framePort(dev, portId),
      mappings,
      colorTarget: 'background',
      padding: pad,
      // Muted border so port markers don't compete with the traffic links.
      colors: { font: '#e6e9ef', background: '#22252b', border: '#39445a', statusDown: '#F2495C' },
    };
  };

  // Router and firewall: 4 rear ports each.
  for (let p = 1; p <= 4; p++) {
    port(`RTR-P${p}`, String(p), 'R-RTR', `Ge0/${p}`, 350 + p * 50, 128);
    port(`FW-P${p}`, String(p), 'R-FW', `P${p}`, 350 + p * 50, 196);
  }
  // Two access switches: 8 ports each.
  for (let p = 1; p <= 8; p++) {
    port(`SW1-P${p}`, String(p), 'R-SW1', `Gi0/${p}`, 250 + p * 45, 264);
    port(`SW2-P${p}`, String(p), 'R-SW2', `Gi0/${p}`, 250 + p * 45, 332);
  }
  // Servers: two NICs, iLO, and dual PSU inlets (A/B feeds).
  const srvY = { 'SRV-1': 450, 'SRV-2': 518, 'SRV-3': 586 };
  for (const [srv, y] of Object.entries(srvY)) {
    const key = srv.replace('-', '');
    port(`${key}-ETH0`, 'eth0', srv, 'eth0', 450, y);
    port(`${key}-ETH1`, 'eth1', srv, 'eth1', 505, y);
    port(`${key}-ILO`, 'ilo', srv, 'ilo', 555, y);
    if (srv === 'SRV-2') {
      // Single-supply server (diversity): one inlet, fed from PDU-A only.
      port(`${key}-PSUA`, 'A', srv, 'psu-a', 648, y);
    } else {
      port(`${key}-PSUA`, 'A', srv, 'psu-a', 610, y);
      port(`${key}-PSUB`, 'B', srv, 'psu-b', 648, y);
    }
  }
  // Two PDU strips (A = primary, B = redundant feed).
  for (let o = 1; o <= 8; o++) {
    port(`PDUA-O${o}`, String(o), 'PDU-A', `outlet${o}`, 757, 120 + 78 * (o - 1));
    port(`PDUB-O${o}`, String(o), 'PDU-B', `outlet${o}`, 842, 120 + 78 * (o - 1));
  }

  const net = { cap: 1e9, stroke: 4 };
  // Power flows one way (PDU -> server), so the outlet is the A side and the
  // arrows lead from the feed into the PSU inlet.
  const pwr = (srv, feed, outlet, inlet, viaX, y) => ({
    frame: `pwr-${srv}-${feed}`,
    a: outlet,
    z: inlet,
    power: true,
    powerQuery: `PWR ${srv.toUpperCase().replace('SRV', 'SRV-')} ${feed}`,
    cap: 1100,
    units: 'watt',
    stroke: 3,
    aLabelOffset: 78,
    zLabelOffset: 35,
    vias: [[viaX, y]],
  });
  const linksSpec = [
    // Trunks.
    { frame: 'rtr:1<->fw:1', a: 'RTR-P1', z: 'FW-P1', cap: 10e9, stroke: 4 },
    { frame: 'fw:2<->sw1:1', a: 'FW-P2', z: 'SW1-P1', cap: 10e9, stroke: 4, aLabelOffset: 80, zLabelOffset: 30, vias: [[158, 196], [158, 264]] },
    { frame: 'sw1:8<->sw2:8', a: 'SW1-P8', z: 'SW2-P8', cap: 10e9, stroke: 4 },
    // Switch-to-server runs through the left NET channel.
    { frame: 'sw1:2<->srv1:eth0', a: 'SW1-P2', z: 'SRV1-ETH0', ...net, aLabelOffset: 85, zLabelOffset: 25, vias: [[172, 264], [172, 450]] },
    { frame: 'sw1:3<->srv2:eth0', a: 'SW1-P3', z: 'SRV2-ETH0', ...net, aLabelOffset: 85, zLabelOffset: 45, vias: [[186, 264], [186, 518]] },
    { frame: 'sw2:2<->srv3:eth0', a: 'SW2-P2', z: 'SRV3-ETH0', ...net, aLabelOffset: 85, zLabelOffset: 65, vias: [[200, 332], [200, 586]] },
    { frame: 'sw2:3<->srv1:eth1', a: 'SW2-P3', z: 'SRV1-ETH1', ...net, aLabelOffset: 85, zLabelOffset: 85, vias: [[214, 332], [214, 450]] },
    // Power: PDU-A feeds every server's A inlet; PDU-B feeds the dual-supply
    // servers' B inlets. SRV-2 has a single supply.
    pwr('srv1', 'a', 'PDUA-O2', 'SRV1-PSUA', 706, 450),
    pwr('srv2', 'a', 'PDUA-O4', 'SRV2-PSUA', 713, 518),
    pwr('srv3', 'a', 'PDUA-O6', 'SRV3-PSUA', 720, 586),
    pwr('srv1', 'b', 'PDUB-O2', 'SRV1-PSUB', 795, 450),
    pwr('srv3', 'b', 'PDUB-O6', 'SRV3-PSUB', 807, 586),
  ];

  return buildCustomTopology(nodesSpec, linksSpec);
}

const dashboards = [
  makeDashboard({
    uid: 'wm-wan-utilization',
    title: 'WAN Demo — Utilization',
    description:
      'Live WAN utilization: parallel core links, VIA-curved long-haul to SITE-NYC, direction and port labels, percent color scale. Click a SITE node to drill down into its building floor plan. Data is simulated by testing/exporter.',
    weathermap: makeWeathermap(
      'wm-wan-utilization',
      buildTopology({
        statusFrames: 'updown',
        withTooltipMetrics: true,
        directionLabels: true,
        nodeDashboardLinks: {
          'SITE-ATL': '/d/wm-floorplan',
          'SITE-DFW': '/d/wm-floorplan',
          'SITE-NYC': '/d/wm-floorplan',
        },
      })
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
  makeDashboard({
    uid: 'wm-global-backbone',
    title: 'WAN Demo — Global Backbone (map background)',
    description:
      'Intercontinental links between the USA, Europe, and the Middle East drawn over a world-map background that pans/zooms with the map. Click NYC to drill into the regional WAN.',
    weathermap: makeWeathermap(
      'wm-global-backbone',
      buildCustomTopology(
        {
          // Positions calibrated to the equirectangular world-map background.
          NYC: { pos: [228, 200], dashboardLink: '/d/wm-wan-utilization', statusQuery: 'STATUS NYC', icon: 'flags/us', iconSize: 26 },
          LON: { pos: [432, 165], statusQuery: 'STATUS LON', icon: 'flags/gb', iconSize: 26 },
          FRA: { pos: [478, 196], statusQuery: 'STATUS FRA', icon: 'flags/de', iconSize: 26 },
          DXB: { pos: [590, 252], statusQuery: 'STATUS DXB', icon: 'flags/ae', iconSize: 26 },
        },
        [
          { frame: 'nyc<->lon', a: 'NYC', z: 'LON', cap: 100e9, portLabel: 'TAT-14', directionLabels: true },
          { frame: 'nyc<->fra', a: 'NYC', z: 'FRA', cap: 100e9, portLabel: 'AC-2', directionLabels: true },
          { frame: 'lon<->fra', a: 'LON', z: 'FRA', cap: 100e9, portLabel: 'PEB-1', directionLabels: true },
          { frame: 'lon<->dxb', a: 'LON', z: 'DXB', cap: 100e9, portLabel: 'EIG-1', directionLabels: true },
          { frame: 'fra<->dxb', a: 'FRA', z: 'DXB', cap: 100e9, portLabel: 'SMW-5', directionLabels: true },
        ]
      ),
      {
        panel: {
          backgroundImage: { url: 'http://localhost:8080/worldmap.svg', fit: 'contain', attachToCanvas: true },
        },
        scale: { title: 'Backbone Load' },
      }
    ),
  }),
  makeDashboard({
    uid: 'wm-floorplan',
    title: 'WAN Demo — Building Floor Plan',
    description:
      'Devices placed over a building/server-room floor plan that moves with the map (Background → Move With Map). Click RACK1-TOR to drill down into its rack port diagram.',
    weathermap: makeWeathermap(
      'wm-floorplan',
      buildCustomTopology(
        {
          'FW-1': { pos: [180, 165], statusQuery: 'STATUS FW-1', icon: 'networking/firewall' },
          'SW-CORE': { pos: [600, 170], statusQuery: 'STATUS SW-CORE', icon: 'networking/switch' },
          'RACK1-TOR': { pos: [470, 440], statusQuery: 'STATUS RACK1-TOR', dashboardLink: '/d/wm-rack-ports', icon: 'networking/switch' },
          'RACK2-TOR': { pos: [730, 440], statusQuery: 'STATUS RACK2-TOR', icon: 'networking/switch', dashboardLink: '/d/wm-rack-cabling' },
          STORAGE: { pos: [470, 520], statusQuery: 'STATUS STORAGE', icon: 'networking/file-server' },
        },
        [
          { frame: 'fw<->sw', a: 'FW-1', z: 'SW-CORE', cap: 10e9, portLabel: 'Gi0/0' },
          { frame: 'sw<->rack1', a: 'SW-CORE', z: 'RACK1-TOR', cap: 10e9, portLabel: 'Te1/0/1' },
          { frame: 'sw<->rack2', a: 'SW-CORE', z: 'RACK2-TOR', cap: 10e9, portLabel: 'Te1/0/2' },
          { frame: 'sw<->storage', a: 'SW-CORE', z: 'STORAGE', cap: 10e9, portLabel: 'Te1/0/3' },
        ]
      ),
      {
        panel: {
          backgroundImage: { url: 'http://localhost:8080/floorplan.svg', fit: 'contain', attachToCanvas: true },
        },
        scale: { title: 'Link Load' },
      }
    ),
  }),
  makeDashboard({
    uid: 'wm-rack-ports',
    extraTargets: [PORT_STATUS_TARGET],
    title: 'WAN Demo — Rack Port Status',
    description:
      'A switch faceplate drawn as the background with each port as a status-colored node: green = up, red = down (ports 7 and 19 are unpatched; port 13 flaps every ~5 minutes), gray = admin-disabled (23/24). T1/T2 are the 10G uplinks.',
    weathermap: makeWeathermap('wm-rack-ports', buildRackPorts(), {
      panel: {
        backgroundImage: { url: 'http://localhost:8080/rack.svg', fit: 'contain', attachToCanvas: true },
      },
      fontSizing: { node: 9, link: 8 },
      scale: { title: 'Load', size: { width: 0, height: 0 } },
    }),
    refresh: '10s',
  }),
  makeDashboard({
    uid: 'wm-multihop',
    title: 'WAN Demo — Multi-hop Path (VIAs)',
    description:
      'One long-haul DC interconnect routed through three VIA points, exactly as double-click VIA editing produces: the A-side value rides the first segment, the Z-side value the last.',
    weathermap: makeWeathermap(
      'wm-multihop',
      buildCustomTopology(
        {
          'DC-WEST': { pos: [120, 300], statusQuery: 'STATUS DC-WEST', icon: 'networking/server' },
          'DC-EAST': { pos: [780, 300], statusQuery: 'STATUS DC-EAST', icon: 'networking/server' },
        },
        [
          {
            frame: 'dc-west<->dc-east',
            a: 'DC-WEST',
            z: 'DC-EAST',
            cap: 100e9,
            vias: [
              [300, 150],
              [450, 420],
              [620, 180],
            ],
            directionLabels: true,
            portLabel: 'HundredGigE0/1/0',
          },
        ]
      ),
      { scale: { title: 'Path Load' } }
    ),
  }),
  makeDashboard({
    uid: 'wm-parallel-lag',
    title: 'WAN Demo — Parallel Links (LAG members)',
    description:
      'A three-member LAG between the aggregation pair, spread apart with Link Offset (-14 / 0 / +14) so each member is individually visible with its own query, port label, and utilization percentage.',
    weathermap: makeWeathermap(
      'wm-parallel-lag',
      buildCustomTopology(
        {
          'AGG-A': { pos: [250, 300], statusQuery: 'STATUS AGG-A', icon: 'networking/switch' },
          'AGG-B': { pos: [650, 300], statusQuery: 'STATUS AGG-B', icon: 'networking/switch' },
        },
        [
          { frame: 'agg-a<->agg-b/1', a: 'AGG-A', z: 'AGG-B', cap: 10e9, offset: -14, portLabel: 'TenGigE0/0/1', percent: true, aAnchor: A.Right, zAnchor: A.Left },
          { frame: 'agg-a<->agg-b/2', a: 'AGG-A', z: 'AGG-B', cap: 10e9, offset: 0, portLabel: 'TenGigE0/0/2', percent: true, aAnchor: A.Right, zAnchor: A.Left },
          { frame: 'agg-a<->agg-b/3', a: 'AGG-A', z: 'AGG-B', cap: 10e9, offset: 14, portLabel: 'TenGigE0/0/3', percent: true, aAnchor: A.Right, zAnchor: A.Left },
        ]
      ),
      { scale: { title: 'Member Load' } }
    ),
  }),
  makeDashboard({
    uid: 'wm-rack-cabling',
    title: 'WAN Demo — Rack Cabling (multi-device, rear view)',
    description:
      'Rear elevation of one rack: router, firewall, two switches, three servers, and redundant PDU-A/PDU-B strips. Every port/NIC/PSU inlet/outlet is a status-colored node; network cables run through the left channel with live traffic, power cables carry each feed\u2019s live wattage. SW1 port 5 is down, SRV-2 lost its standby NIC, and SRV-3\u2019s A feed sits in PDU-A\u2019s dead outlet 6 \u2014 its full draw shifts to the B feed.',
    weathermap: makeWeathermap('wm-rack-cabling', buildRackCabling(), {
      panel: {
        backgroundImage: { url: 'http://localhost:8080/rack2.svg', fit: 'contain', attachToCanvas: true },
        panelSize: { width: 1000, height: 760 },
      },
      fontSizing: { node: 8, link: 7 },
      scale: { title: 'Load %', position: { x: 1, y: 58 }, size: { width: 38, height: 150 }, fontSizing: { title: 12, threshold: 10 } },
    }),
    extraTargets: [RACK_CABLING_TARGET, POWER_TARGET],
    refresh: '10s',
  }),
];

for (const d of dashboards) {
  const file = path.join(OUT_DIR, `${d.uid}.json`);
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + '\n');
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}
