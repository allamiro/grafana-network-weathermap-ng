# Testing Environment

This docker-compose provides three containers for testing the network weathermap plugin end-to-end.

1. **Grafana** — Runs Grafana 12.x (configurable) with the plugin loaded from the local `dist/` build output
2. **Prometheus** — Scrapes the exporter for test metrics
3. **Exporter** — A Prometheus exporter that generates fake bandwidth data (varied + constant)

## Prerequisites

Build the plugin first from the project root:

```bash
npm install
npm run build
```

## Running

```bash
cd testing
docker compose build
docker compose up
```

Grafana will be available at `http://localhost:3101`. A pre-configured dashboard is provisioned with the plugin connected to the Prometheus data source.

To test against a specific Grafana version:

```bash
GRAFANA_VERSION=12.0.0 docker compose up --build
```

## Test Data

The exporter uses Perlin noise to smoothly alternate between 0 Mb/s and 1 Mb/s for the `varied` metric. The `constant` metric stays at 700 Kb/s.
