# FAQ

New to the plugin? See the **[Tutorial → Getting Started](guide/getting-started.md)** first. This page answers common questions.

## Installation & versions

- **Q: Is this the same plugin as `knightss27-weathermap-panel`?**
    - This is a continuation fork. The original plugin was archived in 2023. This fork (`tamirsuliman-weathermap-panel`, display name **Network Weathermap NG**) is modernized and actively maintained. Config exported from the original plugin is compatible.

- **Q: What is the minimum Grafana version?**
    - Grafana **11.0.0**. The plugin uses `@grafana/*` SDK v11 APIs. API compatibility is verified against Grafana 11.x and 12.x in CI.

- **Q: Why does Grafana say the plugin is "unsigned"?**
    - During the initial review a new plugin is unsigned — this is expected. Grafana signs it on approval. To allow an unsigned build in the meantime, add its ID to `allow_loading_unsigned_plugins` in `grafana.ini`. Every release is built via GitHub Actions with a verifiable **provenance attestation**.

## Data / Queries

- **Q: My links show `n/a` even though the query is returning data.**
    - Weathermap matches a series by its **display name**. Make sure the name in the dropdown exactly matches what Grafana shows. With Prometheus wildcard queries returning multiple series, each series gets a unique label-qualified name (e.g. `value {instance="host1"}`). Re-open the link editor and re-select the query from the dropdown.

- **Q: How should I pick the A-side and Z-side queries for a link?**
    - **A side = outbound (A→Z)**, **Z side = inbound (Z→A)**. For a link between two devices, use the A device's *bits sent* for the A side, and either the Z device's *bits sent* or the A device's *bits received* for the Z side (both represent Z→A). See [Links](guide/links.md).

- **Q: The link tooltip shows the same value for the A and Z side.**
    - That usually means both sides point at the same series/direction. Give each side the correct directional counter (see above), and optionally set per-side **[Direction Labels](guide/links.md#direction-labels-inbound-outbound)** so the tooltip clearly names each direction.

- **Q: I can't select one of my queries, even though it's in the dropdown.**
    - Queries with identical display names are deduplicated. If two queries share the same field name and label set, only one entry appears — give them distinct names.

- **Q: I'm using the Zabbix datasource and the only option is "wide".**
    - In the Zabbix datasource settings, turn off the **data alignment** property (or disable it per-query under the query's **Options** section).

- **Q: Zabbix — I can only select one of my queries (but it's labeled properly).**
    - Select multiple Zabbix **Items** through one Grafana query using Regex in the **Item** area of the query editor.

- **Q: Prometheus `rate()` / `increase()` shows 0 or n/a on the first point.**
    - Expected — those functions return `NaN` on the first sample and can go negative on counter resets. The plugin walks back to the last valid non-NaN, non-negative value automatically.

## Features & how-to

- **Q: Can I show the average, peak, or 95th percentile instead of just the latest value?**
    - Yes — **Panel Options → Value Display Mode**: choose **Last, Average, Min, Max, or 95th Percentile** across the selected time range. See [Panel Options](guide/panel-options.md#value-display-mode).

- **Q: Can I replay how the network looked in the past?**
    - Enable **Panel Options → Timeline Slider**, then drag the scrubber at the bottom of the panel to move through the time range. Link values update to that moment; press **Live** to return. See [Timeline Slider](guide/panel-options.md#timeline-slider).

- **Q: How do I add a bend/waypoint (VIA) to a link?**
    - In edit mode, **double-click** a link to insert a VIA, **drag** it to position, and **right-click** it to remove. See [Interactions](guide/interactions.md#editing-vias-on-the-canvas).

- **Q: I can't drag my nodes around — is there a setting to turn that on?**
    - No setting: **dragging works in the panel editor and nowhere else**, so viewers can't nudge the topology by accident on a saved dashboard. Hover the panel and press **`e`** (or panel menu **⋮ → Edit**), drag the nodes, then **Back to dashboard → Save dashboard** — positions live in the panel options, so nothing sticks until you save. Step-by-step with screenshots: [Moving things around the map](guide/interactions.md#moving-things-around-the-map); every gesture in one table: [Gesture reference](guide/interactions.md#gesture-reference).

- **Q: Two links overlap and dragging the nodes doesn't help — what else can I do?**
    - Moving a node often just moves the problem. For two links between the **same pair of nodes**, give each a different **Link Offset**; to route **one** link around something, add waypoints and drag their handles. See [Links](guide/links.md#parallel-links-link-offset).

- **Q: There are grid lines all over my map — how do I turn them off?**
    - Those are **Grid Guides** (Panel Options → **Grid Options**). Turn off **Grid Guides** to remove the lines while keeping drag snapping, or turn off **Enable Node Grid Snapping** to remove both in one toggle — it clears the guides for you. Note the lines only ever appear **while editing the panel**; a saved dashboard never shows them. See [Panel Options → Grid](guide/panel-options.md#grid-snapping-and-guide-lines).

- **Q: Can the background image move and zoom with the map?**
    - Yes — set a background image, then enable **Move With Map**. See [Panel Options → Background](guide/panel-options.md#background).

- **Q: How do I color a node by health (CPU, temperature, up/down)?**
    - Use the node's **Status** section: set a query, add threshold mappings, and pick a Color Target (Border/Background/Both). See [Nodes → Status coloring](guide/nodes.md#status-coloring-node-health).

- **Q: How do I show extra metrics (latency, packet loss) when hovering a node?**
    - Add them in the node's **Tooltip** section. See [Nodes → Node tooltips](guide/nodes.md#node-tooltips-extra-metrics).

- **Q: How do I draw multiple links between the same two devices?**
    - Give each link a different **Link Offset (parallel links)** value so they spread apart. See [Links → Parallel links](guide/links.md#parallel-links-link-offset).

- **Q: How do I make a node clickable to another dashboard?**
    - Set the node's **Dashboard Link** (and optionally **Open Link in Same Tab**). URLs are validated and opened with `noopener,noreferrer`.

- **Q: Can I use dashboard/template variables?**
    - Yes — `$var` / `${var}` are resolved at draw time in labels, queries, status queries, dashboard links, and bandwidth queries. Build one reusable, multi-site panel.

- **Q: My thresholds go above 100% (oversubscribed links). Is that supported?**
    - Yes — color-scale thresholds above 100% are supported and the legend scales accordingly.

- **Q: How do I export or share a map?**
    - Use **Panel Options → Export**: **Export SVG** (image for docs) or **Export JSON** (portable config). See [Interactions → Exporting](guide/interactions.md#exporting-a-map).

## Interactions

- **Q: Pan/zoom/select don't work on my Mac.**
    - Fixed in v1.5.7+. On macOS use **⌘ Cmd** where Linux/Windows use **Ctrl** (Cmd+drag to pan, Cmd+click to multi-select); Shift+scroll zooms. Full gesture table: [Interactions](guide/interactions.md#gesture-reference).

- **Q: How do I zoom in view mode without scrolling the dashboard?**
    - Hold **Shift** and scroll over the panel. In edit mode, plain scroll zooms.

## Appearance

- **Q: Can I upload an image as a background or node icon?**
    - Yes. Host the image at any publicly accessible URL and paste it into the background image or icon URL field.

- **Q: Are the URLs I paste safe?**
    - User-provided URLs (dashboard links, icon URLs, background images) are sanitized — only relative Grafana paths and `http`/`https` are allowed; `javascript:`, `data:`, `file:`, and similar schemes are rejected.

- **Q: The tooltip mini graph shows a flat line or the time axis looks wrong.**
    - A known bug fixed in v1.2.0. Upgrade to the latest release.

## Troubleshooting & migrating

- **Q: Plugin is throwing `toReturn.source is undefined`.**
    - Reload the page. This can occur immediately after saving config changes.

- **Q: On the latest Grafana it crashed with `ReactDOM.findDOMNode is not a function`.**
    - Fixed in v1.5.0+ (React 19 compatibility). Upgrade to the latest release.

- **Q: I exported my config from the original `knightss27-weathermap-panel`. Will it import here?**
    - Yes — the JSON config format is backward-compatible. Use **Export / Import** in the panel editor, or change the panel's `"type"` to `tamirsuliman-weathermap-panel` in the dashboard JSON before importing. Don't switch plugins through the panel-type picker in the UI — Grafana resets the panel options on a UI type switch and the whole map is lost.
    - Link query bindings (A/Z side and bandwidth queries) are stored by their query display name, which this plugin computes slightly differently than the original in some setups (multiple queries returning a same-named column, table-style results). Since v1.6.7 unambiguous old-style names are re-bound automatically as soon as the panel receives data; if a binding stays empty after import (it can be ambiguous — e.g. two queries whose results are indistinguishable by name), re-select it once in the link editor and re-save.

---

Other problems? [Open a new issue](https://github.com/allamiro/grafana-network-weathermap-ng/issues) on GitHub.
