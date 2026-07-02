# Testing Environment

This docker-compose provides three containers for testing the network weathermap plugin end-to-end.

1. **Grafana** — Runs Grafana 12.x (configurable) with the plugin loaded from the local `dist/` build output
2. **Prometheus** — Scrapes the exporter for test metrics
3. **Exporter** — A Prometheus exporter that generates fake bandwidth data and a full simulated WAN

## Prerequisites

Build the plugin first from the project root:

```bash
npm install
npm run build
```

## Running

```bash
cd testing
docker compose build
docker compose up
```

Grafana will be available at `http://localhost:3101`. Five dashboards are provisioned, connected to the Prometheus data source.

To test against a specific Grafana version:

```bash
GRAFANA_VERSION=12.0.0 docker compose up --build
```

## Dashboards

| Dashboard | What it shows |
|---|---|
| **DEV** (`all_dashboards.json`) | Minimal two-node map saved in the **legacy pre-v14 options format** — the regression fixture for the options-schema migration. Do not modernize this file. |
| **WAN Demo — Utilization** | Live utilization on an 8-device WAN: parallel core links, VIA-curved long-haul to SITE-NYC, direction + port labels, percent color scale. |
| **WAN Demo — Device Health** | Node status coloring: devices are colored by packet-loss threshold mappings (green <1%, orange 1–50%, red above). Hover nodes for latency/loss tooltips. |
| **WAN Demo — Capacity Planning (p95)** | Link values show the 95th percentile over the range. The EDGE-1↔SITE-ATL link saturates for ~90 s every 7 min — visible at p95 long after the burst passes. |
| **WAN Demo — Incident Replay (timeline)** | Timeline slider enabled: scrub the range to replay the SITE-DFW outage (status down + traffic collapse for ~2 min every 10 min). |

The four WAN dashboards are generated — do not hand-edit them. To change the topology
or scenarios, edit and re-run:

```bash
node testing/scripts/generate-scenario-dashboards.js
```

## Test Data

The exporter (`testing/exporter/main.go`) produces:

- `wm_bandwidth_data{type="varied|constant"}` — the original Perlin-noise series used by the legacy DEV dashboard.
- `wm_link_bps{link, device, peer, interface, direction}` — simulated WAN link throughput: a compressed diurnal cycle (one "day" ≈ 40 min) plus Perlin noise, asymmetric per direction, scaled to each link's capacity (1G edge / 10G core).
- `wm_device_status{device}` — 1 = up, 0 = down. **SITE-DFW flaps**: down for ~2 min out of every 10 (aligned to the Unix epoch), and its link traffic collapses during the outage.
- `wm_link_errors` / `wm_link_discards{link}` — near zero until a link runs above ~85% utilization. **EDGE-1↔SITE-ATL saturates** to ~97% for ~90 s every 7 min.
- `wm_latency_ms` / `wm_packet_loss_pct{device}` — node tooltip metrics; loss jumps to 100% while a device is down.
