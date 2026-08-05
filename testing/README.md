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
| **WAN Demo — Utilization** | Live utilization on an 8-device WAN: parallel core links, VIA-curved long-haul to SITE-NYC, direction + port labels, percent color scale. SITE nodes drill down to the floor plan. |
| **WAN Demo — Device Health** | Node status coloring: devices are colored by packet-loss threshold mappings (green <1%, orange 1–50%, red above). Hover nodes for latency/loss tooltips. |
| **WAN Demo — Capacity Planning (p95)** | Link values show the 95th percentile over the range. The EDGE-1↔SITE-ATL link saturates for ~90 s every 7 min — visible at p95 long after the burst passes. |
| **WAN Demo — Incident Replay (timeline)** | Timeline slider enabled: scrub the range to replay the SITE-DFW outage (status down + traffic collapse for ~2 min every 10 min). |
| **WAN Demo — Global Backbone (map background)** | NYC/LON/FRA/DXB backbone over a world-map background (public-domain Wikimedia equirectangular map, served by the exporter at `:8080/worldmap.svg`). NYC drills into the WAN. |
| **WAN Demo — Building Floor Plan** | Firewall/core/ToR/storage devices with bundled icons over a server-room floor plan (`:8080/floorplan.svg`) that pans/zooms with the map. RACK1-TOR drills into the rack ports board. |
| **WAN Demo — Rack Port Status** | A switch faceplate (`:8080/rack.svg`) with one status-colored node per port: green up, red down (7/19 hard down, 13 flaps ~5 min), gray admin-disabled (23/24). |
| **WAN Demo — Rack Cabling (multi-device, rear view)** | Full rear elevation (`:8080/rack2.svg`): router, firewall, two switches, three servers, redundant PDU-A/PDU-B. Port/NIC/PSU/outlet status nodes, VIA-routed network cables with live traffic, and power cables carrying per-feed wattage. SW1 port 5 down; SRV-2 is single-supply; SRV-3's A feed sits in PDU-A's dead outlet 6 and shifts its draw to the B feed. Faceplate art comes from the reusable components in `testing/exporter/faceplates.go`. |
| **WAN Demo — Interactive Rack View** | The rack-cabling topology with the dense-map readability features on (plugin ≥ 1.5.12): hover highlight with VIA-chain tracing, one-way power cables, label collision avoidance, zoom-dependent labels, built-in status legend, bold PSU labels. |
| **WAN Demo — Multi-hop Path (VIAs)** | One DC interconnect routed through three VIA points, as double-click VIA editing produces. |
| **WAN Demo — Parallel Links (LAG members)** | Three-member LAG spread with Link Offset, each member with its own query, port label, and utilization %. |
| **WAN Demo — Animated Traffic Flow** | Metric-driven particle animation: dots flow per direction, speed/density scale with utilization, a permanently-down CORE trunk shows ✕ badges. |
| **WAN Demo — BGP Neighbor Map** | BGP sessions as links: session state = link status (dashed + ✕ + DOWN + blink on drop), prefixes as labels, max-prefix fullness as color. iBGP core + eBGP transits (Cisco/Juniper/F5), a permanently-down eBGP peer (EDGE2↔PEER-Y), parallel IPv4/IPv6. Click a router for session detail. |
| **WAN Demo — BGP Session Detail** | Per-router drill-down (state / prefixes / uptime / flaps), reached from the map; `node_name` variable. |
| **WAN Demo — BGP Fleet Overview** | Established / down / total counters, a session status table, and a prefixes-received bar gauge. |
| **WAN Demo — Port Label Positioning** | The WAN map with per-side **Port Label Offset %** (along the link axis) and **Port Label Distance** (perpendicular) set on every interface label, lifting each one clear of its node icon. |

The WAN dashboards are generated — do not hand-edit them. To change the topology
or scenarios, edit and re-run:

```bash
node testing/scripts/generate-scenario-dashboards.js       # core WAN demos
python3 testing/scripts/generate-animated-dashboard.py     # animated traffic
python3 testing/scripts/generate-bgp-dashboards.py         # BGP neighbor map + detail + overview
python3 testing/scripts/generate-port-label-demo.py        # port label offset + distance
```

The world-map background is `BlankMap-World-Equirectangular.svg` from Wikimedia
Commons (public domain), recolored for dark dashboards and embedded in the
exporter (`testing/exporter/assets/worldmap.svg`).

## Test Data

The exporter (`testing/exporter/main.go`) produces:

- `wm_bandwidth_data{type="varied|constant"}` — the original Perlin-noise series used by the legacy DEV dashboard.
- `wm_link_bps{link, device, peer, interface, direction}` — simulated WAN link throughput: a compressed diurnal cycle (one "day" ≈ 40 min) plus Perlin noise, asymmetric per direction, scaled to each link's capacity (1G edge / 10G core).
- `wm_device_status{device}` — 1 = up, 0 = down. **SITE-DFW flaps**: down for ~2 min out of every 10 (aligned to the Unix epoch), and its link traffic collapses during the outage.
- `wm_link_errors` / `wm_link_discards{link}` — near zero until a link runs above ~85% utilization. **EDGE-1↔SITE-ATL saturates** to ~97% for ~90 s every 7 min.
- `wm_latency_ms` / `wm_packet_loss_pct{device}` — node tooltip metrics; loss jumps to 100% while a device is down.
- `wm_port_status{device, port}` — per-port status for the rack boards (0 = down, 1 = up, 2 = admin-disabled); covers switch ports, server NICs/iLO/PSU inlets, and PDU outlets.
- `wm_power_watts{device, feed}` — per-feed server power draw for the rack-cabling demo (feed `a`/`b`; SRV-2 is single-supply, SRV-3's dead A feed reads 0 with the full draw on `b`).
- `bgp_session_up` / `bgp_session_state` / `bgp_prefixes_received` / `bgp_prefixes_advertised` / `bgp_prefix_limit` / `bgp_session_uptime_seconds` / `bgp_peer_flaps_total` `{node_name, peer, peer_ip, peer_as, afi, session_type, vendor}` — normalized BGP neighbor telemetry (`testing/exporter/bgp.go`): a dual-stack AS65001 with Cisco RRs, Juniper borders, and an F5, peering eBGP to two transits + an IX peer. **EDGE2↔TRANSIT-B flaps** (down ~90 s every 8 min) and **EDGE2↔PEER-Y is permanently down**. In production these names come from recording rules over the vendor's raw metric — see [`tools/bgp/`](../tools/bgp/).
- Every link also gets staggered ~45 s micro-bursts every 13 minutes so the maps keep changing like a real enterprise network.

The exporter also serves the demo background images over HTTP (port 8080,
published by the compose file): `/floorplan.svg`, `/worldmap.svg`, `/rack.svg`, `/rack2.svg`.

### If port 8080 is already taken

Those URLs are absolute (`http://localhost:8080/...`) because the **browser**
resolves them, not Grafana — a compose service name would not work. 8080 is a
commonly occupied port, and when it is, the background art simply never loads:
the rack/floor-plan/world-map maps render their nodes on an empty canvas with
no error to explain it.

Publish the exporter somewhere else and regenerate the dashboards to match:

```bash
# docker-compose.override.yml (untracked, local only)
#   exporter:
#     ports: !override ["8082:8080"]

WM_EXPORTER_URL=http://localhost:8082 node testing/scripts/generate-scenario-dashboards.js
# Recreate the exporter (it is what binds the new port) as well as Grafana:
docker compose --project-directory testing up -d --build exporter grafana
```

`WM_EXPORTER_URL` defaults to `http://localhost:8080`, so the committed
dashboards are unchanged unless you set it — don't commit dashboards
regenerated with a custom URL.

## E2E tests

Playwright E2E tests (`tests/panel.spec.ts`, via `@grafana/plugin-e2e`) run in CI
weekly and on demand (Actions → E2E → Run workflow). Locally:

```bash
npm run build
docker run -d --name grafana-e2e -p 3000:3000 \
  -v "$PWD/dist:/var/lib/grafana/plugins/tamirsuliman-weathermap-panel" \
  -e GF_DEFAULT_APP_MODE=development \
  -e GF_AUTH_ANONYMOUS_ENABLED=true \
  -e GF_AUTH_ANONYMOUS_ORG_ROLE=Admin \
  grafana/grafana:latest
npx playwright install chromium   # first time only
npm run e2e
docker rm -f grafana-e2e
```
