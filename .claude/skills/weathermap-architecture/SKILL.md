---
name: weathermap-architecture
description: Plugin architecture — how nodes/links/options are stored, the render and editor pipelines, query binding by display name, the migration system, and the backward-compatibility philosophy. Read before changing WeathermapPanel, types, or any saved-options shape.
---

# Weathermap Architecture

## The one data structure

Everything the user configures lives in ONE serialized object: `options.weathermap`
(`SimpleOptions` in `src/types.ts`), shape `Weathermap { version, id, nodes, links, scale, settings }`.
This JSON is **user data** persisted in dashboards — treat every field as load-bearing forever.

- `Node` — position `[x, y]`, anchors (per-side link budgets), colors, icon, `isConnection`
  (marks a VIA connection node), status query/mappings, `zIndex`.
- `Link` — `nodes: [Node, Node]` (embedded copies, matched by `id`), `sides.A/Z` (`LinkSide`:
  query, bandwidth, anchor, labels), stroke/arrows, `statusQuery`, and optional per-feature
  fields (`linkOffset`, `arrowMeetPercent`, `singleDirection`, `animation`, `waypoints` #334).
- Derived render state (`DrawnNode`, `DrawnLink` with `lineStartA/…/pathPoints`) is computed
  every render in `WeathermapPanel` — NEVER persisted.

## Render pipeline (WeathermapPanel.tsx)

1. `wm` memo: `normalizeWeathermap` → `needsMigration`? → `handleVersionedStateUpdates` on a
   clone. Render uses the migrated copy immediately; a `useEffect` persists it **after commit**
   (calling `onOptionsChange` during render is illegal).
2. Legacy query-name rebind (#331/#333): stored old-plugin display names are rewritten to
   current names, only from a COMPLETE data snapshot (`LoadingState.Done`, no errors).
3. `dataFrameMap` memo: display name → resolved numeric value, once per data/mode change.
   Wide frames yield one bindable series per numeric field (#260). Duplicate names keep the
   FIRST series (#204).
4. `generateDrawnNode` / `generateDrawnLink`: geometry (anchor fan-out via
   `getMultiLinkPosition`, arc-length path math), value formatting, status.
5. JSX layers in order: gradients defs → link lines/arrows → value labels → port labels →
   animation dots → nodes (zIndex-sorted) → tooltips/scale/timeline.

## Query binding — display names, not refIds

A link side stores the **frame/field display name** (`getFieldDisplayName(field, frame, allFrames)`).
`buildQueryOptions` builds the dropdown; the stored value is always the full display name.
Consequences: renames break bindings; dedup is first-occurrence; a stable frame/field id is the
known long-term fix (comment at the `dataFrameMap` construction). Any change to how names are
computed is a BREAKING change for saved maps — see #331 for the fallout and the alias rules.

## Editor pipeline

`module.ts` registers custom editors (`PanelForm`, `NodeForm`, `LinkForm`, `ColorForm`) via
`setPanelOptions` on the `'weathermap'` path. Every form mutation follows one idiom:
`structuredClone(value)` → mutate the clone → `onChange(clone)`. Never mutate `value` in place
(#238). VIA editing happens on the canvas (`handleAddVia`/`handleRemoveVia`).

## Migration system

- `CURRENT_VERSION` in `src/utils.ts` (14, never bumped in this fork).
- `needsMigration` triggers on version mismatch or missing settings leaves; repair is
  `handleVersionedStateUpdates` — a **pure deep-merge over defaults** (`lodash.merge`) that
  preserves unknown fields. It never renames or rewrites values.
- Migration runs in the render path, NOT `setMigrationHandler` — that API's signature changed
  across Grafana majors and fails the levitate CI gate (see `grafana-panel` skill).

## Backward-compatibility philosophy

New per-item features are **optional fields with read-time defaults** (`?? fallback`) — no
version bump, no migration code, absent = exact old behavior. Precedents: `portLabelOffset`
(#309), `arrowMeetPercent`, `singleDirection` (#179), `animation` (#273), `viewZoomPan` (#306),
`waypoints` (#332). A version bump is reserved for genuinely destructive rewrites and has never
been needed. When a feature can't self-describe (e.g. ambiguous data), prefer refusing to guess
over corrupting a working config — see the alias guards in `rebindLegacyQueryNames`.

## VIA vs waypoints

VIA (`addViaToLink`/`removeVia`) splits one logical link into REAL segments joined by
`isConnection` nodes; side data propagates across the chain at render (`withSideData`,
`resolveLinkChain`) — the source of #318-class bugs. Waypoints (#332) bend ONE link through
`Position[]` with no extra nodes. New geometry features should build on waypoints/paths;
VIA stays for genuine multi-hop semantics.
