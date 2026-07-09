# Grafana backup tool

`grafana-backup.py` — export your Grafana dashboards (with their **queries and
datasource references**) and data sources to plain JSON, so you can **back up
before installing this plugin or upgrading Grafana** and restore if anything
goes wrong.

## Requirements

**Python 3 (3.6+). Nothing to install** — the script uses only the standard
library and talks to Grafana's HTTP REST API directly. No `pip`, no Grafana
SDK, no dependencies.

## Authentication

Works with both secured and open Grafana:

| Your Grafana | How to authenticate |
|---|---|
| **Token / service account** (typical production) | `--token "$GRAFANA_TOKEN"` |
| **Basic auth** | `--user admin --password ****` |
| **Open / anonymous auth** (e.g. the demo stack on `:3101`) | no flags needed |

All flags also read from the environment: `GRAFANA_URL`, `GRAFANA_TOKEN`,
`GRAFANA_USER`, `GRAFANA_PASSWORD`.

For production, create a **service account** (Administration → Service accounts)
with the **Viewer** role for backup, or **Editor/Admin** for restore, and use
its token.

## Back up (do this before adding the plugin)

```bash
# Secured Grafana
python3 tools/grafana-backup.py backup \
  --url https://grafana.example.com --token "$GRAFANA_TOKEN" \
  --out ./grafana-backup

# Open-auth demo stack
python3 tools/grafana-backup.py backup --url http://localhost:3101 --out ./grafana-backup
```

Output:

```
grafana-backup/
  folders.json                 # folder structure (uids preserved)
  datasources.json             # datasource config (see secrets note below)
  manifest.json                # Grafana version, counts, per-dashboard datasource refs
  dashboards/
    <folder>/<title>__<uid>.json   # one file per dashboard = full model + folder mapping
```

Each dashboard file is the **exact dashboard model** — every panel, target,
query, and `datasource` reference is preserved verbatim.

## Restore (after the upgrade / if something breaks)

```bash
python3 tools/grafana-backup.py restore \
  --url https://grafana.example.com --token "$GRAFANA_TOKEN" \
  --in ./grafana-backup

# also recreate the data sources (config only — see below)
python3 tools/grafana-backup.py restore --url ... --in ./grafana-backup --datasources
```

Restore is idempotent: dashboards are written with `overwrite`, folders and
data sources are created if missing and skipped if they already exist.

## Two things to know

- **Data source secrets are not exported.** Grafana's API returns datasource
  *config* (type, URL, access mode, `jsonData`) but never the write-only
  secrets (passwords, API keys, TLS certs). After a restore with
  `--datasources`, re-enter secrets once in the Grafana UI. This is a Grafana
  limitation, not a tool bug — your dashboards and queries are fully captured
  regardless.
- **Provisioned dashboards are read-only via the API** and are reported as
  *skipped (provisioned)* on restore — they're already managed by their
  provisioning files, so there's nothing to restore. Your own UI-created
  dashboards restore normally.

## Verified

Backup → delete → restore round-trips a user dashboard with its query intact,
and captures all data sources and per-dashboard datasource references. Tested
against Grafana 12.4 with Prometheus, InfluxDB, Elasticsearch, and Zabbix data
sources.
