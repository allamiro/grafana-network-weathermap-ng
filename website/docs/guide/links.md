# Links

A **link** connects two nodes and visualizes the traffic between them. Each link has two **sides** — **A** and **Z** — so it can show bidirectional flow (A → Z outbound, Z → A inbound).

Open **Panel options → Links**, select a link from the dropdown, or click **Add Link**.

---

## A / Z sides and endpoints

- **A Side** / **Z Side** — the two nodes the link connects.
- Each side has its own query, bandwidth, anchor, and labels, so inbound and outbound can be independent.

**Anchor Point** controls where the link attaches to a node (Center, Top, Bottom, Left, Right) — useful for routing links cleanly around a busy map.

![Link editor: A and Z side options with queries and bandwidth](../img/getting-started/06-link.png)

*The full per-side form: side node, side query, fixed bandwidth (10 Gbps here), label offset, anchor point, dashboard link, port label, and direction label.*

---

## Queries and bandwidth

For each side:

| Field | Purpose |
|---|---|
| **Side Query** | The series whose value drives this side's color/label (e.g. bits sent). |
| **Bandwidth #** | A fixed capacity (e.g. `20000000000` for 20 Gbps) so utilization can show as a percentage. |
| **Bandwidth Query** | Use a series for capacity instead of a fixed number (e.g. interface speed). |

With bandwidth set, the tooltip and coloring can express **throughput %** (current ÷ bandwidth), which is how the color scale bands are matched by default.

![Hover tooltip showing usage, bandwidth and throughput percent](../img/getting-started/08-view-tooltip.png)

---

## Units and decimals

- **Link Units** — a per-link unit formatter (bps, Bps, packets/s, …). Falls back to the panel's **Default Link Units**.
- **Link Value Decimal Places** (panel option) — fixes the number of decimals on all link labels; leave blank for automatic precision.

---

## Labels and label offset

- **Label Offset** — slide the value text along the link (0–100%). Handy when two labels overlap.
- **Port Label** — a per-side interface name (e.g. `ge-0/0/1`) rendered next to the link at 25% from each endpoint, rotated to follow the line.

![WAN map with port labels and direction labels on links](../img/use-cases/wm-wan-utilization.png)

*Port labels (interface names near each endpoint) and value labels on a live WAN map — from the [demo dashboards](use-cases.md).*

---

## Direction labels (inbound / outbound)

By default the tooltip labels values as generic *Inbound / Outbound*. Set an explicit **Direction Label** per side (e.g. `TX-UPLINK`, `RX-DOWNLINK`, `To WAN`) and the tooltip uses your wording instead — removing the implicit A/Z ambiguity. Because each value is labeled by its own side, the naming stays correct no matter which side you hover.

Leave the fields blank to keep the classic Inbound/Outbound behavior.

---

## Arrow meeting point

The two directional arrows meet at the midpoint of a link by default. Use the **Arrow Meeting Point (%)** slider (Link Options) to shift where they meet — lower values move the junction toward the **A** side, higher toward **Z**. Great for asymmetric links and for maps that use VIAs.

---

## Parallel links (link offset)

To draw **multiple links between the same two nodes** without overlap, set a different **Link Offset (parallel links)** on each. The offset shifts the line perpendicular to its A→Z direction; arrows, labels, and coloring all follow the offset line. Zero (default) keeps the straight line.

![Three parallel LAG member links between the same two nodes](../img/use-cases/wm-parallel-lag.png)

*A three-member LAG drawn with per-link offsets — each member keeps its own query, port label, and utilization %.*

---

## Link status (up / down)

Give a link a **Status Query** so it can render as *down*:

- When the status value is `0` or absent, the link uses a configurable **down color** and a **dashed** stroke.
- Optional **blink** animation draws attention to down links.
- While down, status rendering overrides gradient/flow-animation.

---

## Tooltip extra metrics

Add extra rows to the link's hover tooltip (errors, discards, drops, latency, …). In the link's **Tooltip Extra Metrics** section, **Add Metric** with a **Label**, an optional **Inbound Query** and **Outbound Query**, and a **Units** formatter. These rows use your [direction labels](#direction-labels-inbound-outbound) when set.

---

## Stroke and arrows

Under **Stroke and Arrow**:

- **Link Stroke Width** — line thickness.
- **Arrow Width / Height / Offset** — arrow geometry.
- (Panel-level) **Dynamic Stroke** can scale stroke width with utilization, and **Flow Animation** can animate dashes in the direction of flow.

---

## VIAs (waypoints)

A **VIA** is an intermediate bend point on a link — useful to route a link around obstacles or to represent a multi-hop path. VIAs use lightweight *connection nodes* under the hood.

![A link routed through three VIA waypoints](../img/use-cases/wm-multihop.png)

*One DC interconnect routed through three VIAs — exactly what double-click VIA editing produces.*

**Edit a VIA directly on the canvas (edit mode):**

- **Add** — **double-click** a link. A VIA is inserted at the link midpoint (the link splits into A→C and C→Z, preserving each side's query data).
- **Move** — **drag** the VIA like any node.
- **Delete** — **right-click** the VIA; the two segments merge back into one link.

See [Interactions & Editing](interactions.md) for the full gesture reference.
