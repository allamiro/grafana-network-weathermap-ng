---
name: weathermap-regression-tests
description: Fix a bug in the Network Weathermap panel together with regression tests that fail without the fix and also catch the same class of bug next time (Jest + React Testing Library with Grafana's real components). Use this whenever the user reports or asks to fix a bug in tooltips, link values, node status, query bindings, units/formatting, the timeline or the editor; asks for "regression tests", "tests so this can't come back" or "tests to detect similar issues"; or when a PR's tests need strengthening.
---

# Bug fixes with regression tests that hold

The bar for a fix here: a test that **fails on `main`**, passes with the fix, and pins the underlying rule the bug broke, not only the one symptom someone noticed. The #375/#377 tooltip bug is the model. The visible symptom was a missing graph, but the cause (a shared `field.state` written by Grafana internals) also broke node status, link values and the editor. An invariant test ("a hover never writes into `data.series`") caught it, plus two older bugs the symptom tests missed.

Never add `Co-Authored-By: Claude` or any AI attribution to commits or PR bodies.

## Setup and commands

```bash
npm ci && npx patch-package      # patch-package: npm may block the postinstall; brace-expansion must show ✔
npx jest src/WeathermapPanel.hover.test.tsx      # one file
npm run test:ci                                  # full suite, as CI runs it
npm run typecheck && npm run lint
npx prettier --check <files you changed>         # whole-tree check has pre-existing drift; only gate your files
```

`jest-environment-jsdom cannot be found` means `node_modules` isn't installed. Grafana/React `act(...)` warnings in the output are expected noise, so judge by the assertions.

## 1. Reproduce before fixing

Write the failing test first, at the level the user sees the bug. Find the root cause before choosing the fix. If the cause can reach other features, list them and test those too. That's how #377 was found from #375.

## 2. Where tests live

| What | Where |
|---|---|
| Pure helpers in `src/utils.ts` (formatting, aggregation, query names) | `src/utils.test.ts` |
| One component (`LinkTooltipGraph`, `MapNode`, `ColorScale`) | `src/components/<Name>.test.tsx` |
| Panel behaviour (hover, tooltips, values, status, zoom, grid…) | `src/WeathermapPanel.<topic>.test.tsx`; add to the matching topic file before creating one |
| Browser-only behaviour (drag, real Grafana) | `tests/*.spec.ts` (Playwright, see CONTRIBUTING.md) |

Panel tests render the **real** `WeathermapPanel` with Grafana's real `<TimeSeries>`. Don't mock Grafana components: several bugs lived inside Grafana's own code paths (`outerJoinDataFrames`, display-name caching), and a mock hides them.

Use the existing harness rather than inventing one. `src/WeathermapPanel.tooltipState.test.tsx` has `panelProps(data, { build, out, inbound })` and `hoverAndLeave(linkIndex)`, and `src/testData.ts` has `getData`, `getData2` (two links), `getConnectedLinkData` and `theme`. Always pass maps through `handleVersionedStateUpdates(build(theme), theme)`. Useful handles:

- link: `screen.getAllByTestId('link')[i].firstChild`, then `fireEvent.mouseMove(el, { clientX: 100, clientY: 150 })` and `fireEvent.mouseLeave(el)`
- link graph rendered: `document.querySelector('canvas') !== null`
- node tooltip: hover `screen.getByText(node.label).closest('g')`, read `screen.getByTestId('weathermap-node-tooltip')`
- editor query names: `buildQueryOptions(data.series).map(o => o.value)`

## 3. Data shapes that expose bugs

Most bugs here only show for particular frame shapes. Test the shape from the report plus the risky neighbours:

- **Several frames with different names** (two datasources, or several named queries). Grafana prefixes display names with the frame name only when frame names differ, so code that recomputes names on a subset of frames drops the prefix (#375).
- **Wide frames with several value fields.** Bind to `fields[2]`, not `fields[1]`: the legacy-name pass (#331) recomputes `fields[1]` on each data change and hides corruption there.
- **Link A and Z bound to different series.** With one tooltip frame, Grafana caches `multipleFrames=false` and recomputes later, masking the bug.
- **Single datasource** as the control case that must keep working.
- **Number-typed epoch-ms time column** (Infinity/JSONata), #364.
- **Units:** `none`/no unit (no suffix), currency (prefix), `short` (scale word), suffixed (`bps`, `ms`, `percent`), #380.
- **Values:** negatives (#370), all-`null`/`NaN`/`Infinity` series (shown as `n/a`, #373), zero, missing series.

Assert exact rendered text where formatting is involved (`'1  b/s'`, `'Latency: 5'`). "Contains `1`" let `1 undefined` pass for months.

## 4. Prove the test, then prove the guard

Run the new tests against the unfixed code:

```bash
git checkout origin/main -- src/path/Fixed.tsx
npx jest <new test files>        # these must FAIL (a control case may pass, and say which)
git checkout HEAD -- src/path/Fixed.tsx
```

If the bug is one of a class ("something mutates shared state", "a formatter drops a part"), add or extend an **invariant** test that states the rule across several data shapes. The existing one is `describe('hovering never writes into data.series')` in `src/WeathermapPanel.tooltipState.test.tsx`. Extend its `shapes` table instead of writing a parallel test. An invariant needs:

- a baseline taken *after* legitimate work (the first render caches names, so snapshot after it);
- a guard against passing vacuously (it asserts the graph actually rendered on each hover);
- a snapshot of everything a bug could plausibly write (names/state, config, display processor, values).

Then mutation-test it: temporarily reintroduce one or two related bugs (e.g. drop `state: undefined` in `LinkTooltipGraph.tsx`, mutate `f.config` in place, retype the original time field), run, check the invariant fails, and `git checkout -- <file>` to restore. Record the result.

## 5. Comments, commits, PR

- Test comments explain *why* a fixture detail matters ("bound to `fields[2]` because…"), as the existing tests do. Skip comments that restate the code.
- Commits use conventional style with the issue number: `fix: … (#375)`, `test: … (#375, #377)`. No AI trailers.
- PR body: root cause in a few sentences, then a table of each test with its result **on `main`** vs **with the fix**, then the mutation results if you added an invariant, plus the full-suite count and lint/typecheck. `Closes #N` for each issue fully fixed.

## Before reporting done

Show the evidence: the full-suite pass count, which new tests fail without the fix, and (for invariants) which reintroduced bugs they caught. If a test passes on `main` too, say it's a control case or rework it.
