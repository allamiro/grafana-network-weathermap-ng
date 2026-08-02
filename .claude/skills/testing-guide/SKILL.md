---
name: testing-guide
description: Testing strategy and house patterns — suite layout, fixture idioms (toDataFrame, getData, renderPanel), what every feature PR must cover (geometry, migration round-trip, regression, no-options-writes), E2E matrix, and CI gates. Read before writing or reviewing tests.
---

# Testing Guide

## Suite layout

- `src/utils.test.ts` — pure math and helpers. Every geometry/alias/migration helper gets
  exhaustive unit tests here (joints, clamps, zero-length, degenerate inputs).
- `src/WeathermapPanel.<feature>.test.tsx` — one focused RTL suite per feature
  (`.viewzoom`, `.polyline`, …). Keep them small and named after the issue.
- `src/WeathermapPanel.hostile.test.tsx` — malformed/hand-edited options must render, not crash.
- `src/forms/*.test.tsx`, `src/components/*.test.tsx` — editor and component behavior.
- E2E: Playwright (`npm run e2e`), CI runs a **three-Grafana-version matrix** plus levitate
  API-compat checks (11.0.0 / 12.0.0 / 13.x) and CodeQL.

Run all: `CI=true npx jest` (plain `npm test` only runs changed-since-commit).

## House fixtures — use these, don't invent new ones

```ts
// Data frames: pin display names so tests don't depend on Grafana's naming internals
const frame = (refId, displayName, valueFieldName = 'Value') =>
  toDataFrame({ refId, fields: [
    { name: 'Time', values: [1, 2] },
    { name: valueFieldName, values: [10, 20], config: { displayNameFromDS: displayName } },
  ]});

// A full weathermap: two nodes at (200,300)/(400,300) + one link
const wm = handleVersionedStateUpdates(getData(theme), theme);   // from 'testData'

// Panel mount (see WeathermapPanel.viewzoom.test.tsx renderPanel):
// PanelProps cast with LoadingState.Done, empty series, onOptionsChange = jest.fn()
```

Assert on rendered SVG attributes (`points`, `transform`, `viewBox`) and on `onOptionsChange`
calls — not on implementation internals.

## What every feature PR must cover

1. **The math** — unit tests for each new helper including edge cases: exactly-at-joint,
   clamped ends, zero-length segments, empty input, NaN-safety.
2. **The regression guarantee** — prove the feature OFF path is byte-identical: e.g. the
   polyline suite asserts waypoint-less links render two-point halves on the original line.
3. **Migration round-trip** — new optional fields survive `handleVersionedStateUpdates`
   (unknown-field preservation) AND a map without them doesn't gain them; migration stays
   idempotent and never mutates its input (#199).
4. **No stray persistence** — rendering must not call `onOptionsChange`
   (`expect(onOptionsChange).not.toHaveBeenCalled()`), except explicitly-tested self-healing
   paths, which also need a goes-quiet test (steady state returns null / stops firing).
5. **Guard rails** — for anything that rewrites config: ambiguity/partial-data cases where the
   correct behavior is to do NOTHING (see the #331 alias tests: shared legacy name, target
   collision, template-variable passthrough).

## jsdom caveats

`measureText` returns stubbed widths; SMIL doesn't animate (assert the `path`/`dur` attributes
instead); layout is absent, so test geometry via attributes, not `getBoundingClientRect`.

## Visual/manual verification

Real-browser proof lives in `testing/` (Docker env). Dashboards are BAKED INTO the Grafana
image — after changing `testing/grafana/dashboards/*`, rebuild:
`docker compose --project-directory testing up -d --build grafana`. Demo dashboards come from
`testing/scripts/generate-*.py` generators; screenshots for docs are kiosk captures
(`/d/<uid>?kiosk`) via Playwright at deviceScaleFactor 2.
