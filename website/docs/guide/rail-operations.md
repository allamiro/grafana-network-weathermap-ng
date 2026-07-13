# Rail Operations Mode (experimental)

Rail Operations mode turns a weathermap panel into a monitoring-only rail
control-room display: stations, physical tracks, signals, switches,
crossovers, routes, maintenance possessions, and individually identified
trains — all plugin objects bound to read-only telemetry.

!!! danger "Monitoring only"
    Rail Operations mode is intended for visualization, monitoring,
    simulation, and operational awareness. **It must not be used to issue
    safety-critical railway control commands.** All telemetry integration is
    read-only: the plugin never writes to PLCs, RTUs, SCADA systems,
    interlockings, or gateways. Read from a historian, edge gateway, or OT
    DMZ — not directly from safety-critical controllers unless your OT team
    approves.

## Enabling it

Set **Map Mode → Rail (experimental)** in the panel editor (Panel section).
Existing dashboards are untouched: a panel without a `mapMode` is always a
normal network map, and switching back to Network restores the network
renderer. Rail-only editing tools appear only while rail mode is active.

**Load rail baseline** applies the bundled static background (dark canvas,
grid, safe area, corridor and alignment guides) attached to the map canvas so
it pans and zooms with the railway. The background is static context only —
every operational object (track, signal, train, state) is a live plugin
object, never baked into the image.

## The model

| Object | What it is |
|---|---|
| Control point | Station, junction, interlocking, yard, terminal, or depot — a named position |
| Track segment | **One physical track** between two control points, with ordered via waypoints |
| Signal | A head beside a track at a fractional position along it |
| Switch (points) | Normal/reverse pointwork between two segments |
| Crossover | Single/double/scissors connectors between two parallel tracks |
| Train | An identified object placed by *segment + progress (0..1)* |
| Route | A translucent wash over the segments of an established path |
| Incident / maintenance / possession | A dashed hazard wash with an I/M/P badge |

Two parallel railway tracks are **two independent track segments** — never
the two directions of one link. Each physical track carries its own
occupancy, availability, status, signals, and trains.

A segment's geometry derives from its endpoints:
`[fromControlPoint.position, ...viaPoints, toControlPoint.position]` — moving
a control point moves every connected track.

## Binding data

Queries are matched by series display name (use `legendFormat` in
Prometheus). Default numeric conventions (override any of them with value
mappings):

| Query | Convention |
|---|---|
| Track occupancy | non-zero = occupied, `0` = clear |
| Track availability | non-zero = available, `0` = blocked |
| Status (generic) | non-zero = normal, `0` = failed |
| Signal aspect | `0` = stop, `1` = caution, `2` = clear |
| Switch position | `0` = normal, `1` = reverse, `2` = moving |
| Switch detected / locked | non-zero = detected / locked |
| Route established | non-zero = shown, `0` (or missing) = hidden |
| Stale flag | non-zero = stale |

States are **categorical**, never bandwidth percentages. Severity composes
per entity: a live alarm (failed, blocked, stop…) always wins; a missing
primary series (a signal's aspect, a switch's position, a train's position
binding) renders as distinct `no_data`/stale styling and is never masked by a
healthy secondary reading; a flapping secondary series never grays out live
data. Color is never the only signal — down/data-quality states also change
dash pattern, hollowness, or carry an ✕/letter badge.

### Train position

A train binds with a **series-name prefix**: with *Position Series Prefix* =
`TRAIN RD-218`, a series named `TRAIN RD-218 t1-b03` whose value is `0.63`
places the train 63% along segment `t1-b03`. That is exactly the shape of

```promql
wm_rail_train_progress{train_id="RD-218", segment_id="t1-b03"}  # 0.63
```

with `legendFormat` `TRAIN {{train_id}} {{segment_id}}` — as the train
advances, the old series vanishes and the marker follows the new one (the
suffix must match a real segment id). Static segment + progress and a plain
progress query are also supported for authored demos. If a configured
position binding stops resolving, the marker renders stale (dimmed, dashed) —
never as a confidently placed train.

Smooth motion between refreshes is gated by the panel's animation settings
(master switch, reduced motion, edit-mode pause, timeline scrub) and the
animated-elements cap; a segment change snaps instead of animating across the
map.

## Layers

Infrastructure, blocks, tracks, routes, incidents, switches & crossovers,
signals, control points, trains, labels, and editor guides each render as a
layer with visibility and lock toggles, painted in layer order. Layers can
also carry `minZoom`/`maxZoom` windows (wheel steps, larger = zoomed out) —
e.g. hide labels once zoomed far out. Hidden layers are not rendered at all.

## Validation, import/export

The editor validates the topology live and reports (never auto-fixes)
duplicate ids, dangling references, zero-length segments, out-of-range
positions, non-finite coordinates, and orphaned control points. The rail
configuration can be exported to JSON and imported (imports are normalized
and require confirmation).

## Demo

The testing stack ships **Rail Operations Monitoring — Simulated Demo**
(`docker compose up` in `testing/`, then `http://localhost:3101`): a
Yard–A–B–Junction–C–Terminal corridor with two tracks, a depot branch, a
crossover, six signals, two switches, a data-driven route, a maintenance
possession, and four live trains — all driven by clearly-labeled simulated
telemetry from `testing/exporter/rail.go` (see the metric conventions above).

## Known limitations

- `labelQuery`, `directionQuery`, and string destinations are reserved:
  query values resolve numerically today.
- A tooltip whose hover target unmounts under a stationary pointer persists
  until the pointer moves off the panel.
- Signals/switches/crossovers place themselves relative to segment geometry;
  free-floating placement is not supported.
- The mode is experimental and its saved-config shape may evolve while
  flagged as such; `mapMode` and `rail` are optional fields, so disabling the
  mode (or removing the fields) always returns a working network panel.
