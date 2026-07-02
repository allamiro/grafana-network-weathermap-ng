# Interactions & Editing

How to navigate and edit the map with mouse, trackpad, and keyboard — on **Linux, Windows, and macOS**.

---

## Edit mode vs. view mode

- **Edit mode** — the panel edit screen. You can add/move/delete nodes and links, drag VIAs, and zoom freely.
- **View mode** — a saved dashboard. Hover for tooltips; click nodes/links that have dashboard links.

Some gestures (adding VIAs, free zoom) are **edit-mode only** to avoid interfering with normal dashboard use.

---

## Gesture reference

| Action | Linux / Windows | macOS |
|---|---|---|
| **Move a node** | Click-drag the node | Click-drag the node |
| **Pan the map** | **Ctrl**+drag, **Shift**+drag, or middle-mouse drag | **⌘ Cmd**+drag or **Shift**+drag |
| **Zoom** | Scroll (edit mode); **Shift**+scroll (view mode) | Scroll (edit mode); **Shift**+scroll (view mode) |
| **Multi-select nodes** | **Ctrl**+click each node | **⌘ Cmd**+click each node |
| **Add a VIA** | **Double-click** a link (edit mode) | **Double-click** a link (edit mode) |
| **Move a VIA** | Drag the VIA | Drag the VIA |
| **Delete a VIA** | **Right-click** the VIA (edit mode) | **Right-click** (or Ctrl-click) the VIA |

!!! tip "macOS"
    macOS uses **⌘ Cmd** where Linux/Windows use **Ctrl** (Ctrl-click is a right-click on a Mac). Zoom uses the dominant scroll axis, so a Mac's Shift+scroll (which the OS remaps to horizontal) still zooms.

---

## Editing VIAs on the canvas

VIAs (waypoints) let a link bend through intermediate points.

1. **Double-click** anywhere on a link to insert a VIA at its midpoint. The link splits into two segments, and the A-side and Z-side query data are preserved on the correct halves.
2. **Drag** the VIA handle to route the link where you want.
3. **Right-click** a VIA to remove it — the two segments merge back into a single link.

Under the hood a VIA is a lightweight *connection node*; you can also toggle a node into a VIA with **Use As Connection** in the node's Advanced options.

---

## Selecting and aligning multiple nodes

- Hold **Ctrl** (Linux/Windows) or **⌘ Cmd** (macOS) and click nodes to build a selection.
- Drag any selected node to move the whole group.
- Enable the **Grid** (Panel Options) to snap positions for clean alignment.

---

## Exporting a map

Open **Panel options → Export**:

- **Export SVG** — download the current map as an SVG image (icons are inlined). Useful for documentation and diagrams.
- **Export JSON** — download the full weathermap configuration as JSON. You can version-control it or import it into another panel.

---

## Timeline scrubbing

If the [Timeline Slider](panel-options.md#timeline-slider) is enabled, drag the slider at the bottom of the panel to move through history; press **Live** to return to the latest state.
