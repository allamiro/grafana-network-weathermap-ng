---
name: interactive-editor
description: Canvas editing machinery — drag pipeline, pointer/coordinate handling, hit testing, selection, snapping, canvas gestures, and how to add new draggable handles (e.g. waypoint handles). Read before adding or changing any on-canvas interaction.
---

# Interactive Editor

## The drag pipeline (already built — reuse it)

```
pointer event → DraggableCore (react-draggable, see MapNode.tsx)
  → onDrag: getScaledMousePos({deltaX, deltaY})   // zoom + aspect correction
  → update LOCAL state (setNodes)                  // continuous preview, no persistence
  → onStop: onOptionsChange(...)                   // ONE commit per gesture
```

Rules this encodes:
- **Preview locally, commit once.** Dragging updates React state every move; the options write
  happens only on release. Never call `onOptionsChange` per mousemove.
- **All pointer deltas go through `getScaledMousePos`** — it divides out the current zoom
  (`1.2^zoomScale`) and aspect multiplier. Raw client deltas are wrong the moment the user zooms.
- **Grid snapping**: when `settings.panel.grid.enabled`, snap with `nearestMultiple` at commit
  and during drag, same as node dragging does.
- **Multi-select** participates in drags: `selectedNodes` (Cmd/Ctrl+click) move together —
  a new handle type must decide explicitly whether it joins group drags (waypoints: no).

## Canvas gestures in use — don't collide with them

| Gesture | Owner |
|---|---|
| double-click link | add VIA (`handleAddVia`, edit mode only) |
| right-click connection node | remove VIA |
| Cmd/Ctrl+drag | pan the map (drag handlers early-return on `ctrlKey/metaKey`) |
| Shift+wheel / plain wheel (opt-in #306) | zoom |
| double-click canvas (view zoom mode) | reset viewer zoom/pan |
| Shift held on hover | keeps tooltip open (hover-loss early-returns) |

New gestures must be edit-mode-gated (`isEditMode`), `preventDefault`/`stopPropagation` like
the VIA handlers, and must not shadow the table above.

## Hit testing

SVG native event handlers on the rendered shapes ARE the hit test — `onMouseMove`/`onMouseOut`
on lines/polylines/polygons, no manual math. Fat invisible hit targets (a wider transparent
twin stroke) are the accepted technique if a thin line is hard to grab. Tooltips position from
mouse coords relative to `wrapperRef.getBoundingClientRect()`.

## Adding a new handle type (e.g. waypoint drag handles, planned #332 phase 3)

1. Render small `<circle>` handles in edit mode only, in a layer above links, below tooltips.
2. Wrap each in `DraggableCore`; in `onDrag`, apply `getScaledMousePos` deltas to a LOCAL copy
   of the coordinates; live-recompute the link path from that local state so the line follows
   continuously.
3. On `onStop`: `structuredClone(wm)` → write final coords → `onOptionsChange`.
4. Discoverability: visible on link hover/selection in edit mode; cursor `grab`/`grabbing`;
   right-click or a modifier-click removes (mirror the VIA convention); double-click on the
   line inserts (decide explicitly how it coexists with the VIA double-click — e.g. modifier).
5. `aria-label` every interactive handle; respect theme colors for handle fill/stroke.

## State invariants

- Dragged/selected/hovered state lives in component state — never in options.
- Node moves write `nodes[i].position`; link endpoints follow automatically via
  `getMultiLinkPosition` on next render. Never store derived positions.
- After any commit, the next render must reproduce the preview exactly — if it "jumps" on
  release, the preview math and commit math have diverged (usually a missing scale/snap step).
