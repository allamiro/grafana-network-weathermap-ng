# Network Weathermap NG

Draw your network as a live map: nodes for your sites and devices, links for the circuits between them, and colors that change with real traffic. Network Weathermap NG turns any Grafana time series — interface throughput, utilization, error rates — into a classic network weathermap, built and edited entirely inside the Grafana panel editor.

If you have used PHP Network Weathermap, the concepts (nodes, links, color scales) will feel immediately familiar.

![Network weathermap overview](https://raw.githubusercontent.com/allamiro/grafana-network-weathermap-ng/main/src/img/general-example.png)

## What you can do with it

- **NOC wall displays** — a single at-a-glance map of your backbone, WAN, or campus network, colored by live utilization.
- **WAN and backbone monitoring** — see both directions of every circuit independently, so an asymmetric saturation stands out.
- **Capacity planning** — color links by percentage of provisioned bandwidth and spot the circuits trending toward saturation.
- **Incident triage** — node status coloring flags down devices, and per-link dashboard links jump straight to the detailed dashboard for that circuit.
- **Historical review** — scrub the timeline slider to replay link values across the selected time range and see when traffic shifted.

![Example map](https://raw.githubusercontent.com/allamiro/grafana-network-weathermap-ng/main/src/img/example_00.png)
![Example map](https://raw.githubusercontent.com/allamiro/grafana-network-weathermap-ng/main/src/img/example_01.png)

## How it works

Each **link** has two sides, A and Z, and each side is driven by one query from the panel:

- **A side** shows traffic flowing A → Z (for example, *bits sent* on the A device's interface).
- **Z side** shows traffic flowing Z → A (for example, *bits received* on the A device's interface).

Every side gets a bandwidth (a fixed number or another query), and the link segment is colored by the **color scale** — either percentage of bandwidth or absolute thresholds.

**Nodes** are the endpoints: label them, give them icons (networking, server, database, and computer icon sets are bundled), and optionally color them from a status metric.

## Setting up a map

1. Add the panel to a dashboard and add one query per link direction. Give each query a clear name or legend — you pick queries by name in the editor.
2. Open the panel options and expand **Edit Weathermap**.
3. Under **Nodes**, add your nodes, then drag them into position on the canvas (a snappable grid with alignment guides is available).
4. Under **Links**, add a link, choose its A and Z nodes, and assign each side its query and bandwidth.
5. Under **Color Scale**, define your thresholds — green/yellow/red utilization bands, or absolute values.
6. Save the dashboard. The map updates with every dashboard refresh.

## Feature highlights

### Links

- Independent A/Z sides with per-side queries, bandwidth, labels, and direction labels (for example *Inbound* / *Outbound*).
- Multiple parallel links between the same two nodes.
- Curved routing with VIA points — double-click a link on the canvas to add one, right-click to remove.
- Value display modes: last, average, minimum, maximum, or 95th percentile over the dashboard time range, with configurable decimal places and units.
- Optional dynamic stroke width, animated traffic flow, and gradient coloring.
- Port/interface labels so the physical circuit is visible on the map.

### Nodes

- Icons with adjustable size, padding, and constant spacing.
- Status coloring from a metric: color the node border, background, or both, with configurable value-to-color threshold mappings.
- Per-node dashboard links (open in the same or a new tab) for drill-down.

### Tooltips

- Hovering a link shows both directions with inbound/outbound graphs.
- Add extra metric rows to link and node tooltips — errors, discards, latency, packet loss, or anything else you can query.

### Panel

- Pan, zoom, and multi-select with mouse or trackpad (macOS-compatible controls).
- Timeline slider to replay link values across the selected time range.
- Custom background color or image, adjustable fonts, and a movable, resizable color-scale legend.
- One-click SVG export of the map.

## Data sources

The panel reads standard Grafana data frames, so it works with Prometheus, InfluxDB, Graphite, Zabbix, MySQL/PostgreSQL, and any other data source that returns time series. Each link side expects a single numeric series.

## Requirements

Grafana **11.0.0 or later**.

## Learn more

- [Documentation](https://allamiro.github.io/grafana-network-weathermap-ng/)
- [Report an issue or request a feature](https://github.com/allamiro/grafana-network-weathermap-ng/issues)

This plugin continues the archived [knightss27 weathermap panel](https://github.com/knightss27/grafana-network-weathermap), modernized for current Grafana releases and licensed under Apache-2.0.
