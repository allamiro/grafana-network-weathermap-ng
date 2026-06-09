# FAQ

## Installation

- **Q: Is this the same plugin as `knightss27-weathermap-panel`?**
    - This is a continuation fork. The original plugin was archived in 2023. This fork (`tamirsuliman-weathermap-panel`) is modernized for Grafana 12+ and actively maintained. Config exported from the original plugin is compatible.

- **Q: What is the minimum Grafana version?**
    - Grafana **11.0.0**. The plugin uses `@grafana/*` SDK v11 APIs. API compatibility is verified against Grafana 11.x and 12.x in CI.

## Data / Queries

- **Q: My links show `n/a` even though the query is returning data.**
    - Make sure your query's display name in the dropdown exactly matches what Grafana shows. With Prometheus wildcard queries returning multiple series, each series gets a unique label-qualified name (e.g. `value {instance="host1"}`). Re-open the link editor and re-select the query from the dropdown to pick up the correct name.

- **Q: I am unable to select one of my data queries, even though it shows up in the query selection dropdown.**
    - Queries with identical display names are deduplicated in the dropdown. If two queries share the same field name and label set, only one entry appears. See [Adding Data](/#adding-data) for details.

- **Q: I am using the Zabbix datasource and the only option in the query selection dropdown is "wide".**
    - In the Zabbix datasource settings, try turning off the **data alignment** property. You can also disable it per-query under the query's **Options** section.

- **Q: I am using the Zabbix datasource and can only select one of my queries (but it is labeled properly).**
    - Try selecting multiple Zabbix **Items** through one Grafana query by using Regex in the **Item** area of the query editor.

- **Q: Prometheus `rate()` or `increase()` queries show 0 or n/a on the first data point.**
    - This is expected — `rate()` and `increase()` return `NaN` on the first sample and may return negative values on counter resets. The plugin walks back to find the last valid non-NaN, non-negative value automatically.

## Appearance

- **Q: Can I upload an image as a background or node icon?**
    - Yes. Host the image at any publicly accessible URL and paste it into the background image or icon URL field in the panel settings.

- **Q: The tooltip mini graph shows a flat line or the time axis looks wrong.**
    - This was a known bug fixed in v1.2.0. Upgrade to the latest release.

## Other

- **Q: Plugin is throwing `toReturn.source is undefined`.**
    - Reload the page. This can occur immediately after saving config changes and is resolved with a page reload.

- **Q: I exported my weathermap config from the original `knightss27-weathermap-panel`. Will it import here?**
    - Yes. The JSON config format is backward-compatible. Use **Export / Import** in the panel editor to migrate your config.

---

Other problems? [Open a new issue](https://github.com/allamiro/grafana-network-weathermap-ng/issues) on GitHub.