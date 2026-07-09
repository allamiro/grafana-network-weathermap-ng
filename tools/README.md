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

### How to generate a Grafana token

**Grafana 9.1+ (service account token — recommended):**

1. Log in to Grafana as an **Admin**.
2. Go to **Administration → Users and access → Service accounts**
   (older 9.x: **Configuration (gear) → Service accounts**).
3. Click **Add service account**. Give it a name (e.g. `dashboard-backup`) and a role:
   - **Viewer** — enough to **back up** (read dashboards/data sources).
   - **Editor** (or **Admin**) — needed to **restore** (write dashboards/folders/data sources).
4. Click **Create**, then on the service account page click **Add service account token**.
5. Name the token, optionally set an **expiration**, and click **Generate token**.
6. **Copy the token now** — Grafana shows it only once. It looks like `glsa_xxxxxxxx…`.
7. Use it with the tool:
   ```bash
   export GRAFANA_TOKEN="glsa_xxxxxxxxxxxxxxxxxxxx"
   python3 tools/grafana-backup.py backup --url https://grafana.example.com
   ```

**Grafana < 9.1 (legacy API key):** **Configuration (gear) → API Keys → Add API key** →
set a name and role (Viewer to back up, Editor/Admin to restore) → **Add** → copy the key
and use it as `--token`.

> **Tip:** Keep the token in an environment variable or your secrets manager — don't paste
> it on the command line where it can land in your shell history. Delete the service account
> / token when you're done if it was only for a one-off migration.

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
