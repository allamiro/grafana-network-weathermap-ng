# Grafana Network Weathermap Plugin

<p align="center">
  <img src="src/img/logo.svg" alt="Plugin Logo" width="120" height="120">
</p>

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Grafana Version](https://img.shields.io/badge/Grafana-10%2B-orange)](https://grafana.com/)
[![Node Version](https://img.shields.io/badge/Node-20%2B-green)](https://nodejs.org/)

<p align="center">
  <strong>A modernized, actively maintained network weathermap panel plugin for Grafana</strong>
</p>

This is a continuation of the original [knightss27-weathermap-panel](https://github.com/knightss27/grafana-network-weathermap), updated for modern Grafana environments.

---

## ✨ Features

- 🗺️ **Customizable network weathermaps** with modern design
- 🔄 **Grafana integration** - seamless interoperability with Grafana data sources
- 🎨 **PHP Network Weathermap compatibility** - familiar design patterns
- 📊 **Real-time data visualization** - dynamic updates based on your metrics
- 🛠️ **Easy configuration** - intuitive panel editor interface

## 📸 Screenshots

### 🚀 Quick Start

![Example Image 1](https://raw.githubusercontent.com/allamiro/grafana-network-weathermap/main/src/img/general-example.svg)

### 📊 More Examples

![Example Image 2](https://raw.githubusercontent.com/allamiro/grafana-network-weathermap/main/src/img/example_00.png)

![Example Image 3](https://raw.githubusercontent.com/allamiro/grafana-network-weathermap/main/src/img/example_01.png)

![Example Image 4](https://raw.githubusercontent.com/allamiro/grafana-network-weathermap/main/src/img/example_02.png)

## 🔄 Modernization Updates

This fork modernizes the plugin for current Grafana versions with the following changes:

- **Grafana 10/11 compatibility** — Updated `@grafana/data`, `@grafana/runtime`, and `@grafana/ui` to 11.x.
- **React 18** — Upgraded from React 17 to React 18.
- **Node 20+** — Minimum Node.js version is now 20.
- **TypeScript 5** — Upgraded to TypeScript 5.4+.
- **Modern styling** — Migrated from `stylesFactory` to `useStyles2` and from `emotion` to `@emotion/css`.
- **Type safety** — Removed all `@ts-ignore` overrides; added proper types for event handlers and data access.
- **Deprecated API fixes** — Replaced `Vector.get()` with direct array indexing.
- **Playwright E2E** — Migrated from deprecated Cypress-based `@grafana/e2e` to Playwright-based `@grafana/plugin-e2e`.

## 🚀 Getting Started

### 📋 Requirements

- Grafana >= 10.0.0
- Node.js >= 20

### 💻 Development

```bash
# Install dependencies
npm install

# Start development server (watches for changes)
npm run dev

# Run Grafana with the plugin loaded
npm run server

# Run unit tests
npm run test:ci

# Run E2E tests
npm run e2e

# Lint
npm run lint

# Type check
npm run typecheck
```

### 🐳 Docker

A `docker-compose.yaml` is provided for local development and testing:

```bash
docker-compose up --build
```

This starts Grafana 11 at `http://localhost:3000` with the plugin pre-loaded and provisioned dashboards available.

## ⚙️ Provisioning

Sample dashboards and data source configurations are included under the `provisioning/` directory. Running `docker-compose up` from a fresh environment provides a working example out of the box.

## 👤 Author

**Tamir Suliman** — [allamiro@gmail.com](mailto:allamiro@gmail.com) — [GitHub](https://github.com/allamiro)

## 📄 License

Apache-2.0 — see [LICENSE](LICENSE) for details.
