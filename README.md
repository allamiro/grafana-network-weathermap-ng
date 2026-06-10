<div align="center">
  <img src="src/img/logo.svg" alt="Grafana Network Weathermap NG" width="200" height="200">

  # Grafana Network Weathermap NG

  **A modernized, actively maintained network weathermap panel plugin for Grafana**

  [![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
  [![Grafana Version](https://img.shields.io/badge/Grafana-11%2B-orange)](https://grafana.com/)
  [![Node Version](https://img.shields.io/badge/Node-20%2B-green)](https://github.com/allamiro/grafana-network-weathermap-ng/blob/main/CONTRIBUTING.md)

  This is a continuation of the original [knightss27-weathermap-panel](https://github.com/knightss27/grafana-network-weathermap), updated for modern Grafana environments.
</div>

---

## Features

- **Customizable network weathermaps** — draw nodes, links, and color scales that match your infrastructure layout
- **Real-time data visualization** — dynamic link and node coloring based on live Grafana metrics
- **PHP Network Weathermap compatibility** — familiar design patterns for teams migrating from classic tools
- **Multi-source support** — works with Prometheus, InfluxDB, Zabbix, and any Grafana-compatible data source
- **Intuitive panel editor** — build and modify maps entirely within the Grafana UI, no external tools required

---

## Screenshots

<p align="center">
  <img src="src/img/general-example.png" alt="Network Weathermap Overview" width="700">
</p>

<p align="center">
  <img src="src/img/example_00.png" alt="Example 1" width="340">
  <img src="src/img/example_01.png" alt="Example 2" width="340">
</p>

---

## Getting Started

### Requirements

| Requirement | Minimum Version |
|---|---|
| Grafana | 11.0.0 |
| Node.js | 20.x |

### Installation

**Option 1 — Grafana Marketplace (recommended)**

1. In Grafana, go to **Administration → Plugins → Find more plugins**
2. Search for **Network Weathermap**
3. Click **Install**

**Option 2 — Manual**

```bash
# Download the latest release
curl -LO https://github.com/allamiro/grafana-network-weathermap-ng/releases/latest/download/tamirsuliman-weathermap-panel.zip

# Extract to your Grafana plugins directory
unzip tamirsuliman-weathermap-panel.zip -d /var/lib/grafana/plugins/

# Restart Grafana
systemctl restart grafana-server
```

### Quick Start

1. Create or open a dashboard
2. **Add panel** → search for **Network Weathermap**
3. Connect a data source (Prometheus, InfluxDB, etc.)
4. Use the **Map Editor** tab to add nodes and links
5. Assign metrics to links and configure color thresholds
6. Save the dashboard

---

## Development

For local setup, build commands, Docker environment, and contribution guidelines, see [CONTRIBUTING.md](https://github.com/allamiro/grafana-network-weathermap-ng/blob/main/CONTRIBUTING.md).

---

## Modernization

This plugin modernizes the archived original for current Grafana versions:

| Area | Change |
|---|---|
| Grafana SDK | Updated `@grafana/data`, `@grafana/runtime`, `@grafana/ui` to 11.x |
| Grafana dependency | Minimum version set to **11.0.0** |
| React | Upgraded from React 17 to **React 18** |
| Node.js | Minimum version raised to **20** |
| TypeScript | Upgraded to **TypeScript 5.4+** |
| Styling | Migrated from `stylesFactory` to `useStyles2` and `@emotion/css` |
| Type safety | Removed all `@ts-ignore` overrides; added proper types throughout |
| Deprecated APIs | Replaced `Vector.get()` with direct array indexing |
| E2E testing | Migrated from deprecated `@grafana/e2e` to `@grafana/plugin-e2e` (Playwright) |
| CI/CD | Added release workflow, GitHub Pages docs, and Grafana API compatibility checks |

---

## Contributing

Contributions are welcome. Please open an issue first to discuss significant changes.

- [Report a bug](https://github.com/allamiro/grafana-network-weathermap-ng/issues/new?template=bug_report.md)
- [Request a feature](https://github.com/allamiro/grafana-network-weathermap-ng/issues/new?template=feature_request.md)
- [Browse open issues](https://github.com/allamiro/grafana-network-weathermap-ng/issues)

---

## Author

**Tamir Suliman** — [allamiro@gmail.com](mailto:allamiro@gmail.com) — [GitHub](https://github.com/allamiro)

## License

Apache-2.0 — see [LICENSE](https://github.com/allamiro/grafana-network-weathermap-ng/blob/main/LICENSE) for details.
