---
name: svg-geometry
description: The link geometry engine — canonical path principle, arc-length math, the path helper API in utils.ts, arrows/joins/offsets, and how to extend to curves (Bézier, Catmull-Rom, orthogonal routing) without touching consumers. Read before changing how links, arrows, labels, or animation are positioned.
---

# SVG Geometry Engine

## The canonical path principle

Every link has ONE canonical path: `pathPoints = [lineStartA, ...waypoints, lineStartZ]`
(built in `generateDrawnLink`, stored on `DrawnLink`; #334). Every feature derives from it:

```
pathPoints
  ├─ rendered halves (pathPointsA / pathPointsZ via subPath)
  ├─ arrow meet point + arrowheads (arc distance + local segment direction)
  ├─ value labels (pointAtPathPercent)
  ├─ port labels (arc position + local segment angle per end)
  ├─ down-link ✕ badges (pointAtPathPercent at 0.25/0.5/0.75)
  ├─ animateMotion dot paths (pathToSvg, duration = pathTotalLength / speed)
  ├─ hit testing (SVG native events on the rendered <polyline>)
  └─ label collision (LabelPlacement.path → labelBoxAt)
```

**Never duplicate geometry.** If a feature needs a point on the link, it calls a path helper —
it does not re-lerp the A→Z chord. A straight link is just a 2-point path; every helper reduces
exactly to chord math for it, which is the regression guarantee.

## The helper API (src/utils.ts, pure + unit-tested)

- `pathTotalLength(pts)` — sum of segment lengths; 0 for <2 points.
- `pointAtPathLength(pts, dist)` — point at arc distance, **clamped to [0, length]**.
- `pointAtPathPercent(pts, pct)` — pct of total arc length, clamped 0..1.
- `directionAtPathLength(pts, dist)` — unit vector of the containing segment;
  **skips zero-length segments**; degenerate path falls back to `{x:1, y:0}` (never NaN —
  mirrors `getArrowPolygon`'s guard).
- `subPath(pts, from, to)` — sub-polyline with interpolated cut points, interior bends kept.
- `pathToSvg(pts)` / `pathToPoints(pts)` — `animateMotion` path data / `<polyline>` points.

Rules encoded in these helpers — keep them when extending:
distances clamp instead of extrapolating; duplicate points must not produce NaN directions;
outputs are fresh objects (no aliasing of input points).

## Arrows and direction

Arrowheads are triangles from `getArrowPolygon(tail, tip)` — direction comes from the segment
the arrow LANDS ON (`directionAtPathLength`), not the whole-chord vector. The Z arrow travels
against path direction, so its tail reference is `center + dir`. The meet point is
`totalLen * arrowMeetPercent%` (clamped 5–95), arrow gap = `arrows.offset + arrows.height`.

## Offsets and joins — known limits

- `linkOffset` (parallel links) shifts the whole straight chord perpendicular. It is
  **mutually exclusive with waypoints** — per-segment offsetting needs miter/join math this
  renderer doesn't do. If you implement it, do proper joins; don't offset segments naively.
- Rendered halves use `<polyline strokeLinejoin="round" fill="none">` — `fill` matters, an
  unfilled polyline paints its interior.
- Gradient link coloring (`grad-a-/grad-z-` linearGradients) spans the straight chord in
  userSpaceOnUse — documented limitation on bent paths.

## Extending to curves — the contract

Future shapes (quadratic/cubic Bézier, Catmull-Rom through waypoints, rounded corners,
orthogonal/auto routing, edge bundling) must NOT touch consumers. The extension point is the
helper layer: either (a) flatten the curve to a dense polyline once in `generateDrawnLink` and
feed the existing helpers — cheapest, works with `animateMotion` and `<path>` alike — or
(b) generalize the helpers behind the same signatures (`getPointAtLength`-style over a path
abstraction). Consumers already speak only "point/direction at arc length", which is exactly
SVG's own `getPointAtLength` model. Tangents and normals for label placement come from
`directionAtPathLength` (normal = `{-dir.y, dir.x}`).
