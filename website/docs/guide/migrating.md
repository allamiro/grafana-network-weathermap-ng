# Migrating from `knightss27-weathermap-panel`

Network Weathermap NG is a continuation of the original
[knightss27/grafana-network-weathermap](https://github.com/knightss27/grafana-network-weathermap),
archived in 2023. Maps built with the original plugin move across without being redrawn —
nodes, links, colours, scales, and layout are all read from the same saved structure.

This page is the complete migration path, including the one step people most often get
wrong.

---

## The one rule: never switch plugins from the panel-type picker

!!! danger "Changing the visualization type in the UI destroys the map"
    Grafana resets a panel's options when you change its visualization type from the
    picker. Weathermap keeps your entire map — every node, link, and setting — inside
    those options, so switching this way discards all of it. There is no undo once the
    dashboard is saved.

    Edit the dashboard JSON instead, as described below.

---

## 1. Export the dashboard

From the dashboard, use **Dashboard settings → JSON Model** (or **Share → Export**) and
save the JSON.

!!! tip "Work on a copy"
    Import the migrated JSON under a new name/UID first and confirm it renders before
    retiring the original dashboard.

---

## 2. Change the panel type in the JSON

Find each weathermap panel and change its `type`:

```json
{
  "type": "tamirsuliman-weathermap-panel",
  "options": {
    "weathermap": { "nodes": [], "links": [] }
  }
}
```

| Old value | New value |
|---|---|
| `knightss27-weathermap-panel` | `tamirsuliman-weathermap-panel` |

Leave `options.weathermap` exactly as it is — that object is the map, and this plugin
reads the original format directly.

---

## 3. Import

Use **Dashboards → New → Import** and paste the edited JSON. Nodes, links, positioning,
colour scales, and visual settings all come across.

---

## 4. Check your link queries

This is the only part that may need attention, and since **v1.6.7** it usually resolves
itself.

**Why it happens.** Weathermap doesn't store a query's `refId` — it stores the query's
**display name**, the label you pick from the dropdown in the link editor. NG computes
that display name slightly differently from the original plugin in some setups, most
commonly when several queries return a same-named column (very typical with the Infinity
data source, where every query returns a field called `Value`). NG disambiguates those
with the query's `refId`/labels; the original didn't. The saved string then matches
nothing, and the dropdown looks empty — but nothing was deleted, and the underlying
queries are untouched.

**What NG does about it.** On the first data load after import, the panel re-binds
old-style names automatically. The rewrite is deliberately conservative — it only acts on
bindings that currently resolve to **nothing**, only when a legacy name maps to exactly
**one** current series and doesn't collide with a live name, and only once every query has
loaded without error. Working bindings and template-variable queries are never touched.

Automatic re-binding covers every place a query name is stored:

| Location | Fields |
|---|---|
| Link sides | `sides.A` / `sides.Z` — query and bandwidth query |
| Link status | `statusQuery` |
| Link tooltips | `tooltipMetrics[].queryA` / `.queryZ` |
| Node status | `statusQuery` |
| Node tooltips | `tooltipMetrics[].query` |

**When it can't decide.** If two of your queries produce genuinely indistinguishable
names, NG leaves those dropdowns empty rather than guessing. Open the link editor,
re-select the query, and save once — the name is then stored in NG's format and stays
stable.

!!! tip "Many links to fix by hand?"
    Open one link editor to see what NG now calls each query, then find-and-replace the
    old name with the new one throughout the dashboard JSON. The mapping is identical for
    every link using that query.

---

## What to expect afterwards

| Area | Result |
|---|---|
| Nodes, links, layout, colours, scales | Carried over unchanged |
| Link query bindings | Automatic since v1.6.7; ambiguous cases need one manual re-select |
| Minimum Grafana version | **11.0.0+** — see the [FAQ](../faq.md) |
| Plugin signature | Releases from the Grafana catalog are signed |

Features added since the fork — traffic animation, BGP neighbour status, polyline links —
are all opt-in and default to off, so a migrated map looks the same as it did before until
you turn them on.

---

## Still stuck?

[Open an issue](https://github.com/allamiro/grafana-network-weathermap-ng/issues) with a
sanitized copy of your dashboard JSON (redact any internal URLs and credentials). Real
exported dashboards become regression fixtures, so a report with one attached tends to get
fixed and stay fixed.

See also: [Getting Started](getting-started.md) · [Links](links.md) ·
[Data Sources](datasources.md) · [FAQ](../faq.md)
