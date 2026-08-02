---
name: rendering-performance
description: Performance rules for the panel — memoization boundaries, compositor-only animation, steady-state fast paths, allocation discipline in render loops, and caching patterns. Read before adding per-render computation, animation, or anything that runs per link per refresh.
---

# Rendering Performance

## Memoization boundaries (the established ones)

```
data.series ──useMemo──▶ dataFrameMap (once per data/mode change, NOT per link)
options.weathermap ──useMemo──▶ migrated wm (clone only when migration needed)
wm + data ──useMemo──▶ legacy rebind (null fast path — see below)
render ──▶ generateDrawnLink computes ALL geometry once; JSX only reads DrawnLink fields
```

Follow the pattern: derive once, store on the Drawn* object, let every JSX consumer read the
precomputed value. Never compute path lengths, text measurement, or color blends inside a JSX
expression that runs per element.

## Steady-state fast paths — pay only when something changes

Recurring work that usually does nothing must detect the no-op BEFORE allocating:
- `needsMigration` is a cheap check; the clone+merge runs only when true, then goes quiet.
- `rebindLegacyQueryNames` scans stored strings first and returns `null` without cloning the
  map — the clone happens only when a rewrite will actually occur (#333 review, P2).
- Data refreshes hit these paths every interval — a "harmless" clone per refresh on a
  500-link map is not harmless.

## Animation: compositor, not React

Traffic dots are SMIL `<animateMotion>`; flow dashes are CSS keyframes. **No
requestAnimationFrame, no per-frame React state, no re-render per tick** — the compositor
owns motion (#264/#273 design decision). Any new animated element follows the same rule.
Guards that keep animation cheap and polite: `prefers-reduced-motion`, edit-mode pause,
timeline-scrub pause, `maxAnimatedLinks` cap, zero-utilization → zero dots.

## Caching in utils

- `measureText` — canvas TextMetrics cache (capped at 500 entries).
- `getSolidFromAlphaColor` — color-blend cache keyed by fg+bg.
Add similar bounded caches only for genuinely hot, referentially-transparent functions.

## Allocation discipline

- Don't rebuild arrays/objects per link per render when they can live on the DrawnLink from
  `generateDrawnLink` (e.g. `pathPoints`/`pathPointsA/Z` are computed once there).
- `[...arr].reverse()` / clones inside `.map()` over links are acceptable at current scales
  but must not appear inside per-frame or per-mousemove code paths.
- Label collision (`spreadLabels`) is greedy O(placed × steps) — fine per render at map scale;
  never call it per mouse event.

## When touching perf, verify — don't guess

The panel's scale target is hundreds of links. Before optimizing, reproduce with a large map
(the `testing/` env's generator scripts make this easy) and measure with React Profiler /
Performance tab. After optimizing, confirm rendered output is unchanged — the test suite's
exact-coordinate assertions exist precisely so perf refactors can't silently move pixels.
