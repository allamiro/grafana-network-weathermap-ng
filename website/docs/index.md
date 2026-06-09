<center><img src="/assets/logo.svg" alt="Network Weathermap NG Logo" width="200" style="background: lightgrey; padding: 2rem; border-radius: 1rem; box-shadow: #aaa 0.5rem 0.5rem 1rem;"/></center>

<center>
# Grafana Network Weathermap NG
</center>

<center>
A modernized, actively maintained network weathermap panel plugin for Grafana 12+.<br>
Maintained by <a href="https://github.com/allamiro">Tamir Suliman</a> — Plugin ID: <code>tamirsuliman-weathermap-panel</code>
</center>

---

## About This Fork

This plugin is a continuation of the original [knightss27/grafana-network-weathermap](https://github.com/knightss27/grafana-network-weathermap) which was archived in 2023. The goal of this fork is to keep the plugin working with current Grafana releases and to fix outstanding bugs.

**What changed from the original:**

| Area | Change |
|---|---|
| Plugin ID | `tamirsuliman-weathermap-panel` (was `knightss27-weathermap-panel`) |
| Grafana SDK | Updated to `@grafana/*` v11 — requires **Grafana 12.0.0+** |
| React | Upgraded from React 17 → React 18 |
| Styling | Migrated from deprecated `stylesFactory` → `useStyles2` + `@emotion/css` |
| Deprecated APIs | Replaced `Vector.get()` with direct array indexing |
| Datasource compat | Value extraction now finds the first numeric field instead of hardcoding `fields[1]` |
| Security | All `window.open()` calls use `noopener,noreferrer`; `locationService` replaces `window.location` |
| CI / CD | Node.js 24, GitHub Actions Pages deployment, Grafana API version matrix |

Contributions and bug reports are welcome at [github.com/allamiro/grafana-network-weathermap-ng](https://github.com/allamiro/grafana-network-weathermap-ng).

---

## Installation

### Installing on a local Grafana

Requires **Grafana 12.0.0 or later**.

#### Option A — Grafana Marketplace (once approved)

```bash
grafana-cli plugins install tamirsuliman-weathermap-panel
```

The plugin will be installed into your Grafana plugins directory (default `/var/lib/grafana/plugins`). [More on the CLI tool.](https://grafana.com/docs/grafana/latest/administration/cli/#plugins-commands)

#### Option B — Manual install from GitHub release

1. Download the latest ZIP from the [Releases page](https://github.com/allamiro/grafana-network-weathermap-ng/releases/latest/)
2. Extract it into your Grafana plugins directory:

```bash
unzip tamirsuliman-weathermap-panel-*.zip -d /var/lib/grafana/plugins/
```

3. Restart Grafana and enable the plugin under **Administration → Plugins**.


#### 2: Add the Panel to a Dashboard

Installed panels are available immediately in the Dashboards section in your Grafana main menu, and can be added like any other core panel in Grafana.

To see a list of installed panels, click the Plugins item in the main menu. Both core panels and installed panels will appear.

### Testing

For testing with Docker, follow the instructions on the [testing README](https://github.com/allamiro/grafana-network-weathermap-ng/tree/main/testing#readme). This will provide you with an instance to play around with.

---
## Creating a New Weathermap

1. In Grafana, create a new `Empty Panel`.
2. Change the visualisation in the top right corner to `Network Weathermap`.
3. You now have a brand new network weathermap panel! 🎉
4. Learn about weathermap basics below!

---

## On Startup

By default, the panel will start completely blank, looking something like this:

![Blank Panel](img/basics/1-on-startup.png)

### Adding Nodes

- Make sure you have selected `Edit` on the panel in Grafana.
- On the right hand side, find the `Nodes` editor.

    ![Nodes 0](img/basics/2-nodes-0.png)

- Click `Add Node` to create a new node.
- Nodes have three basic fields:
    - X position (`number`): Node's X position.
    - Y position (`number`): Node's Y position.
    - Label (`string`): The text visible on the node.
- You can then move the node by dragging it with your mouse.

### Adding Links

- Ensure you have at least two nodes.
- On the right hand side, find the `Links` editor.

    ![Nodes 1](img/basics/2-nodes-1.png)

- Click `Add Link` to create a new link.
- Links are split into two sides, `A` and `B`.
- Each side has four central fields:
    - Side (`Node`): The node this side of the link connects to.
    - Query (`Query`): A query representing the current side's throughput in the specified units.
    - Bandwidth # (`number`): A number representing the bandwidth of this side in specified units.
    - Bandwidth Query (`Query`): A query representing the bandwidth of this side in the specified units.
    - Units (`unit`): The units the link expects to recieve its data as. This is used for both the main query and bandwidth. Defaults to `bits/sec (SI)` (`bps`).
- Select `A` and `B` side nodes from their respective dropdowns.

### Adding Data

- The weathermap expects a data frame with two fields, a time and a number.
- You probably want this number in `bits/sec`, unless your links are expecting something else (each link has customizable units, and default units are customizable in the global settings for the panel).
- The weathermap will always choose the most recent data point available. If you want your links graphs to have data, make sure your queries are ranges and not "Instant" queries, as this will mean there is no data to show on each graph.
- Once you have added a query in the panel editor, you can can see all queries and select one from the dropdown in the Query fields of the links.
- See the [FAQ](/faq) or [Github issues](https://github.com/allamiro/grafana-network-weathermap-ng/issues) if you are having issues adding data (especially Zabbix datasource users).

**PLEASE NOTE:** _Queries with the exact same labels will be considered as such. If you have multiple queries and are unable to select the one that you want, double check to make sure it is labeled uniquely._

### Setting Thresholds

- The weathermap color scale allows you to color links based on their bandwidth usage.
- On the right hand side, find the `Color Scale` editor.
  ![Nodes 2](img/basics/2-nodes-2.png)
- Click `Add Scale Value` to create a new threshold.
- Each threshold has two basic fields:
    - % (`number`): The percent of bandwidth usage at which to _start_ this threshold.
    - Color (`picker`): The color of this threshold, can be any valid CSS `color` chosen or input with the picker.
        - `green` | `#00FF00` | `rgb(0, 255, 0)`
- By default, the scale will fill from the highest threshold to 100%. You can see the scale in the top left of the panel. When updating numerical values, click off of the input when you're finished to allow the scale to update.

### Interacting with the Weathermap

- In editing mode:
    - `Click + Drag` nodes to move them.
    - `Shift + Drag` or hold and drag `Middle Mouse` to move the map.
    - `Scroll` to zoom.
    - `Ctrl + Click` to select/deselect multiple nodes before dragging.
    - `Double Click` to deselect all nodes.
- Outside of editing mode (including read-only users):
    - `Shift + Scroll` to zoom.
    - `Shift + Drag` to move the map.
- Hover over links to see tooltip information.
    - Hold `Shift` while hovering to free up the mouse.
    - Hover over the same link or another to unfreeze the tooltip.