---
name: design-guidelines
description: UX and visual-quality bar for the panel and its editor — interaction feedback, no-jump/no-flicker rules, theme correctness, accessibility, and label/legibility standards. Read before shipping any user-facing UI or visual change.
---

# Design Guidelines

## The bar

The editor should feel like Grafana's native editors, Excalidraw, or draw.io — direct
manipulation with immediate feedback — not like an HTML form bolted onto a picture. X/Y number
inputs are acceptable as the PRECISION channel, never as the only channel: if a thing has a
position, the roadmap must include manipulating it on the canvas (waypoints: form first in
#334, drag handles as the committed follow-up).

## Interaction rules

- **Every action has visible feedback.** Hover states, cursor changes (`copy` for add-gesture
  zones, `pointer` for clickables, `grab/grabbing` for handles), selection highlighting
  (`linkOpacity` dims non-selected chains on hover).
- **Dragging is continuous.** Local-state preview every pointer move; the object tracks the
  cursor with zoom-corrected deltas. Nothing snaps into place only on release unless grid
  snapping is on — and then it snaps DURING the drag too.
- **Nothing jumps, nothing flickers.** Self-healing rewrites (migration, query rebind) render
  from the corrected copy on the SAME frame they're computed — the user never sees the broken
  state flash. Commit math must equal preview math (see interactive-editor invariants).
- **No hidden state.** Anything that changes saved behavior is visible in the form; anything
  viewer-local (view zoom, scrub) is visibly transient and never saved. When a setting is
  ignored (linkOffset + waypoints), SAY so inline next to the control.

## Visual quality

- Respect both themes: colors from `theme.colors.*`; translucent user colors blended via
  `getSolidFromAlphaColor` against the actual panel background. Never assume dark.
- Semantics of color are already assigned: utilization scale green→red; down-state uses the
  link's down color with dashed stroke. Don't introduce a red that could read as "95–100%"
  — precedent: down-badges are a neutral disc + down-colored ring + theme-contrast ✕ (#273)
  precisely to avoid colliding with the scale.
- Text over lines gets a backing rect (value labels) or perpendicular offset (port labels);
  labels sit ON the drawn geometry (arc-length placement), never floating on an invisible chord.
- Round joins on bent strokes (`strokeLinejoin="round"`); no unfilled-polyline fills; label
  collision spreading keeps dense maps readable (`spreadLabels`).

## Motion

Opt-in, purposeful, interruptible: master switch + per-link override, `prefers-reduced-motion`
respected, paused in edit mode and while scrubbing (motion means "live"). Animation encodes
data (speed/density = utilization) — never decoration.

## Accessibility

- `aria-label` on icon-only buttons and canvas handles (e.g. "Remove waypoint 2").
- Keyboard reachability for form controls comes free from @grafana/ui — don't break it with
  div-buttons; canvas gestures get form equivalents so everything is possible without a mouse.
- Tooltips/help on every non-obvious control (`InlineField tooltip=`), written as behavior
  ("Shifts the link line perpendicular to its direction…"), not as a restatement of the label.

## Docs are part of the feature

User-visible features ship with: a guide section, an FAQ entry if it answers a recurring
question, a demo dashboard in `testing/` when visual, and a real screenshot (kiosk capture of
the built plugin — never a mockup). Limitations are documented in the same PR, phrased as
current behavior, not apology.
