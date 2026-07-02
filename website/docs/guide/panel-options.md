# Panel Options

Panel-level options apply to the whole weathermap. Open the panel options sidebar and look under **Panel** and **Link Options**.

---

## Background

- **Color** — the canvas background color.
- **Image** — set a background image by URL (floor plan, geographic map, building outline, network zones). Choose an **Image Fit** (contain / cover / auto).
- **Move With Map** — when enabled, the background image is drawn *inside* the map canvas so it **pans and zooms together** with the nodes and links. When off (default), the image stays fixed like a wallpaper.

!!! warning "Image URLs are validated"
    Only relative Grafana paths and `http`/`https` URLs are allowed; unsafe schemes are rejected.

---

## Canvas size, zoom, and offset

| Option | Purpose |
|---|---|
| **Viewbox Width / Height (px)** | The logical size of the drawing area. |
| **Zoom Scale** | Current zoom level (also controlled by scroll — see [Interactions](interactions.md)). |
| **View Offset X / Y** | Current pan offset. |
| **Display Timestamp** | Show the time-range end timestamp in the corner. |

---

## Grid

Enable **Grid** to snap node dragging to a fixed grid, set the **grid size**, and optionally show **guides**. Great for aligning large maps.

---

## Value Display Mode

Controls how each metric is resolved from the data points **across the selected dashboard time range**:

| Mode | Meaning |
|---|---|
| **Last** | The most recent data point (default). |
| **Average** | Mean of all points in the range. |
| **Min** | Smallest value in the range. |
| **Max** | Largest value in the range. |
| **95th Percentile** | 95th percentile over the range. |

Use **Average / 95th Percentile** for capacity-planning views where a single-point snapshot is misleading; **Max** to catch peaks.

---

## Timeline Slider

Enable **Timeline Slider** to add a scrubber at the bottom of the panel. Drag it to move through the selected time range and see **link values as they were at that moment** — the whole map updates retroactively.

- A **timestamp label** shows the selected time.
- The **Live** button returns to the latest/aggregate value.
- Off by default; enabling it changes nothing until you scrub.

Perfect for **incident retrospectives** (replay an outage), **trend analysis**, and comparing **peak vs. baseline** periods.

!!! note "Scope"
    The slider currently scrubs **link values**. Node status coloring follows the latest value.

---

## Default link units and decimals

- **Default Link Units** — the unit formatter used by links that don't set their own.
- **Link Value Decimal Places** — fixes decimal precision on link labels (blank = automatic).

---

## Coloring behavior

| Option | Purpose |
|---|---|
| **Color Scale Mode** | Match thresholds by **percent** (current ÷ bandwidth) or by absolute **value**. |
| **Gradient Color** | Blend the link color between its A and Z endpoint colors. |
| **Dynamic Stroke** | Scale link stroke width with utilization (min/max width). |
| **Flow Animation** | Animate the link's dashes in the direction of flow (with a speed setting). |

---

## Color scale / thresholds

Define the **Color Scale** — a list of `threshold → color` stops. Depending on **Color Scale Mode**, thresholds are matched against utilization **percent** or the raw **value**. The legend at the bottom of the panel reflects these bands. Thresholds above 100% are supported for oversubscribed links.

---

## Tooltip settings

Customize the hover tooltip: **font size**, **text/background colors**, **inbound/outbound line colors**, and whether the mini graph scales to bandwidth.
