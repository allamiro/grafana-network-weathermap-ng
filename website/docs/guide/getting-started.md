# Getting Started — Your First Weathermap

This guide walks you from an empty dashboard to a live weathermap showing traffic between two devices. It should take about 10 minutes.

!!! info "Prerequisites"
    - **Grafana 11.0.0 or later** with the *Network Weathermap NG* panel installed (see [Installation](../index.md#installation)).
    - At least one data source (Prometheus, InfluxDB, Zabbix, or any Grafana-compatible source) returning **time-series interface counters** (e.g. bits/sec in and out of an interface).

---

## 1. Create the panel

1. Open or create a dashboard and click **Add → Visualization**.
2. In the visualization picker, search for **Network Weathermap** and select it.
3. You now have an empty weathermap canvas and, on the right, the panel options.

The map has two states:

| State | How you get there | What you can do |
|---|---|---|
| **Edit mode** | The panel edit screen (where you are now) | Add/move/delete nodes and links, drag VIAs, zoom |
| **View mode** | A saved dashboard | Hover for tooltips, click nodes/links that have dashboard links |

---

## 2. Add your data queries

Weathermap doesn't query data itself — it *reuses the panel's queries*. In the **Queries** tab (below the panel), add the metrics you want to visualize. A typical link needs two series:

- **Outbound (A → Z)** — e.g. interface bits sent
- **Inbound (Z → A)** — e.g. interface bits received

!!! tip "Give queries readable names"
    Weathermap identifies a series by its **display name**. Use a query `refId` or a transform/legend so each series has a clear, unique name — you'll pick it from a dropdown later.

---

## 3. Add your devices (nodes)

1. In the panel options, open the **Nodes** section.
2. Click **Add Node**. A node appears in the middle of the canvas.
3. Set its **Label** (e.g. `SW-CORE`).
4. Drag the node on the canvas to position it. (Hold nothing — just click-drag in edit mode.)
5. Repeat for a second device (e.g. `BKB-CARPINA`).

See [Nodes (Devices)](nodes.md) for icons, status coloring, and per-node tooltips.

---

## 4. Connect them with a link

1. Open the **Links** section and click **Add Link**.
2. Set **A Side** to your first node and **Z Side** to the second.
3. Under **A Side Options**, set **A Side Query** to your *outbound* series and, optionally, **A Bandwidth #** (or **A Bandwidth Query**) to the link capacity so utilization can be shown as a percentage.
4. Under **Z Side Options**, set **Z Side Query** to your *inbound* series and its bandwidth.

The link now colors itself according to utilization, and arrows show direction. See [Links](links.md) for units, direction labels, and more.

---

## 5. Set the color scale

1. Open the **Color Scale / Thresholds** section (panel options).
2. Add thresholds mapping a **percentage** (or absolute value) to a color — for example `0% → green`, `50% → yellow`, `80% → orange`, `95% → red`.

Links and the legend now reflect these bands.

---

## 6. Save and use it

1. Click **Apply / Save dashboard**.
2. In view mode, **hover a link** to see a tooltip with usage, bandwidth, throughput %, and a mini time-series graph.
3. **Hover a node** to see any extra metrics you configured.

---

## Where to go next

- **[Nodes (Devices)](nodes.md)** — icons, status colors, node tooltips, dashboard links
- **[Links](links.md)** — queries, units, direction labels, port labels, parallel links, VIAs
- **[Panel Options](panel-options.md)** — background image, value display modes, timeline slider, tooltips
- **[Interactions & Editing](interactions.md)** — pan/zoom/select on every OS, VIA editing, export
- **[Use Cases](use-cases.md)** — end-to-end scenarios (capacity planning, incident retros, floor plans)
