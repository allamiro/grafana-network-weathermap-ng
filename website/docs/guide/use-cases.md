# Use Cases & Scenarios

End-to-end recipes that combine the options into real dashboards. Each assumes you've completed [Getting Started](getting-started.md).

---

## 1. WAN link utilization (two sites)

**Goal:** show a core uplink between two sites, colored by utilization, with clear inbound/outbound labels.

1. Add nodes `SW-CORE` and `BKB-CARPINA`.
2. Add a link A=`SW-CORE`, Z=`BKB-CARPINA`.
   - **A Side Query** = the outbound direction A→Z — `SW-CORE`'s interface *bits sent*; **A Bandwidth #** = link capacity (e.g. `20000000000`).
   - **Z Side Query** = the reverse direction Z→A. Use either `BKB-CARPINA`'s *bits sent* **or** `SW-CORE`'s *bits received* (both represent Z→A) — not `BKB-CARPINA`'s *bits received*, which is the same A→Z direction as the A side; **Z Bandwidth #** = same capacity.
3. Set **A Direction Label** = `Outbound`, **Z Direction Label** = `Inbound`.
4. Add **Port Labels** (e.g. `Eth-Trunk12`) so the physical interface is visible.
5. Color scale: `0→green, 50→yellow, 80→orange, 95→red` with **Color Scale Mode = percent**.

Hovering the link shows usage, bandwidth, throughput %, and a mini graph.

---

## 2. Capacity planning (avg / 95th percentile)

**Goal:** compare typical vs. peak load over a period, not just the instantaneous value.

1. Build the map as in scenario 1.
2. Set the dashboard time range to the period of interest (e.g. *last 30 days*).
3. **Panel Options → Value Display Mode:**
   - Choose **95th Percentile** to size links for sustained peaks, or **Average** for typical load.
   - Switch to **Max** to spot the worst-case moment.
4. Compare against your color-scale bands to find links that are hot at p95.

---

## 3. Incident retrospective (timeline replay)

**Goal:** replay how the network looked during an outage window.

1. Enable **Panel Options → Timeline Slider**.
2. Set the dashboard time range to span the incident.
3. In view mode, **drag the slider** to the moment the incident began and step forward — link colors and values update to that time.
4. Use the timestamp label to correlate with alerts/logs. Press **Live** to return to now.

---

## 4. Data-center floor plan (background follows the map)

**Goal:** overlay devices on a floor plan or rack layout that zooms/pans with the map.

1. **Panel Options → Background → Image**: paste the floor-plan image URL; set **Image Fit** to `contain`.
2. Enable **Move With Map** so the image scales and pans with the nodes.
3. Place nodes on top of the plan at their physical locations; use the **Grid** for alignment.
4. Add links to show inter-rack or inter-room traffic.

---

## 5. Multi-hop path with VIAs

**Goal:** draw a link that routes around other elements or represents a multi-hop path.

1. Create the A and Z nodes and a direct link.
2. In edit mode, **double-click** the link to drop a VIA, then **drag** it to the bend point.
3. Repeat to add more bends. Use **Arrow Meeting Point (%)** to place the direction arrows on the most meaningful segment.
4. **Right-click** any VIA to remove it later.

---

## 6. Device health overview (status coloring)

**Goal:** at-a-glance device health without reading numbers.

1. For each node, open **Status** and set a **Query** (e.g. `up`, CPU %, temperature).
2. Add **Threshold Mappings** (`value ≥ threshold → color`) and pick a **Color Target** (Border / Background / Both).
3. Optionally add **node Tooltip** metrics (latency, packet loss, CPU) so hovering shows the detail behind the color.

---

## 7. Parallel links between the same nodes

**Goal:** show a LAG/port-channel or redundant paths as separate lines.

1. Add multiple links between the same two nodes.
2. Give each a different **Link Offset (parallel links)** value (e.g. `-8`, `0`, `+8`) so they spread apart.
3. Set each link's own query so the members are individually visible.

---

## 8. Clickable drill-down map

**Goal:** click a device to open its detailed dashboard.

1. Give each node a **Dashboard Link** (e.g. `/d/abc/switch-detail?var-host=$host`).
2. Use `${var}` template variables in labels, queries, and links for dynamic, reusable maps.
3. In view mode, clicking the node navigates to the target (safely, in a new tab by default).

---

## Tips that apply everywhere

- **Template variables** (`$var`, `${var}`) are resolved at draw time in labels, queries, status queries, dashboard links, and bandwidth queries — build one panel that serves many sites.
- **Export SVG/JSON** from the Export section to share diagrams or move a map between panels.
- Keep series **display names unique and readable** — that's how weathermap matches queries to links/nodes.
