# Contributing

Thank you for your interest in contributing to the Network Weathermap plugin.

## Prerequisites

- Node.js 20+
- npm 9+
- Docker (for the local Grafana environment)

## Setup

```bash
git clone https://github.com/allamiro/grafana-network-weathermap-ng.git
cd grafana-network-weathermap-ng
npm install --legacy-peer-deps
```

## Development

```bash
# Start webpack in watch mode
npm run dev

# In a separate terminal, start Grafana with the plugin loaded
npm run server
```

Grafana will be available at `http://localhost:3000` (admin / admin).

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start webpack in watch mode |
| `npm run build` | Production build |
| `npm run test:ci` | Run unit tests |
| `npm run e2e` | Run Playwright E2E tests |
| `npm run lint` | ESLint check |
| `npm run typecheck` | TypeScript type check |

## Docker environment

A fully provisioned local environment is provided via Docker Compose:

```bash
docker-compose up --build
```

This starts Grafana at `http://localhost:3000` with the plugin pre-loaded and sample dashboards provisioned from the `provisioning/` directory.

## Submitting changes

1. Open an issue first to discuss significant changes
2. Fork the repo and create a branch from `main`
3. Make your changes and add tests where applicable
4. Ensure `npm run test:ci` and `npm run typecheck` pass
5. Open a pull request referencing the issue number

## Reporting bugs

Use the [bug report template](https://github.com/allamiro/grafana-network-weathermap-ng/issues/new?template=bug_report.md).

## License

By contributing you agree that your contributions will be licensed under the Apache-2.0 license.
