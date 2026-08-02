---
name: grafana-panel
description: Grafana panel-plugin rules for this repo — options lifecycle, React constraints, the levitate API-compatibility gate, theme, data states, and editor patterns. Read before touching module.ts, panel props/options handling, or adding any @grafana/* API call.
---

# Grafana Panel Development Rules

## Options lifecycle — the iron rules

- **Never mutate `options` during render.** Render from a normalized/migrated CLONE; persist
  via `onOptionsChange` in a `useEffect` after commit (see the migration-persist effect in
  `WeathermapPanel`). Calling `onOptionsChange` during render updates the panel wrapper while
  the component renders — a React violation that manifests as flaky editor state.
- **Forms:** `structuredClone(value)` → mutate clone → `onChange(clone)` (#238). Helpers like
  `addViaToLink`/`removeVia` mutate their argument by design — always hand them a clone.
- **Every persisted write must converge.** Any effect that calls `onOptionsChange` needs a
  steady state where it stops firing (migration goes quiet at `CURRENT_VERSION`; the legacy
  rebind returns `null` once names are rewritten). An effect that writes every data refresh
  is a bug.
- **Destructive rewrites need complete data.** Gate on
  `data.state === LoadingState.Done && !data.error && !data.errors?.length` before persisting
  anything derived from `data.series` — a partial namespace makes safety guards unsound
  (learned in #333 review).

## The levitate CI gate (repo-specific, easy to trip)

CI runs `levitate is-compatible` against @grafana/data|ui|runtime at **11.0.0, 12.0.0, 13.x**.
It fails on ANY used API whose **signature changed** between those versions — not just removals.
Known trap: `PanelPlugin.setMigrationHandler` (changed 11→13) — which is why migration runs in
the render path instead. Before using a new `@grafana/*` API, check it exists with the same
signature across the whole support matrix, or gate/avoid it. Keep `grafanaDependency` in
`src/plugin.json` in sync with what you actually call.

## React & performance constraints

- Expensive derivations (`dataFrameMap`, migrated `wm`, rebind) are `useMemo` — never inline
  in JSX. Geometry is computed once per render in `generateDrawnLink`, not per JSX consumer.
- Don't depend on DOM order for behavior; z-order is explicit (`zIndex` sort, #280).
- jsdom is the test environment: anything canvas/SMIL-dependent needs guards or test shims.

## Mode separation

`isEditMode` comes from `locationService.getSearch().has('editPanel')`. Edit-only affordances
(drag, VIA gestures, guides) must be inert in view mode. Viewer-local state (view zoom/pan
#306, timeline scrub) must NEVER be written into options — viewers may lack edit rights, and
one viewer's view state is not dashboard content.

## Theme & inputs

- Colors from `useTheme2()` / `useStyles2()`; blend user colors against panel background with
  `getSolidFromAlphaColor`. Never hardcode light-or-dark-only colors.
- Template variables (`$var`) are interpolated at draw time via `getTemplateSrv().replace`
  in labels, queries, status queries, and dashboard links — never resolve them at save time.
- Numeric inputs report `NaN` on blank — sanitize with `finiteOrFallback` /
  `parseOptionalFiniteNumber` (#200) before saving.
- User URLs go through `sanitizeUrl` (relative Grafana paths + http/https only) and open with
  `noopener,noreferrer`.
