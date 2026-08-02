---
name: engineering-philosophy
description: The master skill — priority order for decisions, generality-over-one-off design, defensive guards for config-rewriting code, and this repo's delivery discipline (branch/PR, release, marketplace gates). Read at the start of any non-trivial feature or fix.
---

# Engineering Philosophy

## Priority order

```
Correctness  >  Backward compatibility  >  Performance  >  UX  >  Documentation
```

All five ship in the same PR — the order only settles CONFLICTS:
- A faster render that can draw the wrong value loses to correctness.
- A cleaner schema that breaks one saved dashboard loses to compatibility. `options.weathermap`
  is user data embedded in dashboards we cannot see or fix — treat every field as forever.
- A nicer interaction that costs per-frame React re-renders loses to performance.

## Build the general mechanism, expose the specific feature

Never solve today's feature without considering tomorrow's. The test: "what's the SECOND
feature this code enables?" If the answer is "none", the design is probably too specific.

Worked example (#332): the ask was "waypoints", the build was a **path engine** — pure
arc-length helpers (`pointAtPathLength`, `subPath`, …) that every consumer (arrows, labels,
animation, collision) speaks through. Bézier links, rounded corners, orthogonal/auto routing,
edge bundling, and canvas link editing all become helper-layer changes with zero consumer
churn. Same shape elsewhere: `ValueMappingMode` generalized "last value"; `LabelPlacement`
generalized label sliding; version-scoped npm overrides generalized the exact-pin CVE fix.

Generalize the MECHANISM, not the config surface: expose the one field users asked for;
keep the engine underneath ready for more.

## Code that rewrites user config is guilty until proven safe

Migrations, rebinds, and self-healing passes follow the #331/#333 doctrine:
1. Rewrite only what is currently BROKEN (resolves to nothing) — never redirect a working value.
2. Rewrite only on an UNAMBIGUOUS match — two candidates, or a collision with a live value,
   means do nothing; a silent wrong guess is strictly worse than the visible breakage.
3. Act only on COMPLETE information (`LoadingState.Done`, no errors) — partial state makes
   guards unsound.
4. Converge — a steady state where the pass detects no-op cheaply and goes quiet.
5. Prove all four in tests, including the do-nothing cases.

## Delivery discipline (this repo)

- Branch + PR for everything; squash-merge; ONE clean commit per PR after review fixes
  (amend + `--force-with-lease`). No AI attribution of any kind in commits or PRs.
- Address every reviewer finding (human or bot) with code or a reasoned reply on the PR —
  cubic/Codex P1s get fixed, not argued with.
- Releases are tag-driven (`v*.*.*` → build, sign, **provenance attestation**, zip+md5);
  package.json version must equal the tag; changelog entry rides in the release PR.
- Marketplace gate: osv-scanner hard-blocks on high/critical CVEs in `package-lock.json` —
  even dev-only transitive ones — and a fix requires a NEW tagged release. Run
  `npm audit --audit-level=high` before tagging.
- Fixes reference their issue everywhere (commit, PR "Closes #N", changelog); the reporter
  gets a comment with what shipped and, when visual, a real screenshot.

## When stuck between designs

Prefer: the option that keeps saved maps untouched; the option that adds an optional field
over one that changes a field's meaning; the option that refuses to guess; the option whose
OFF state is provably the old behavior. If none fit, it's a schema-version conversation —
which this fork has never yet needed.
