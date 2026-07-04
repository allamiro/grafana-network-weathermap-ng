#!/usr/bin/env python3
"""Generate the InfluxDB and Elasticsearch variants of the WAN Utilization
demo dashboard (#253).

The weathermap binds series by display name, and the bridge tags every
sample with the exact display names the Prometheus dashboards use — so the
weathermap options copy over VERBATIM: same diagram, same bindings, only
the targets (and, for Influx, one rename transformation) differ.

Run from testing/:  python3 scripts/generate-datasource-dashboards.py
"""
import copy
import json

SRC = "grafana/dashboards/wm-wan-utilization.json"

base = json.load(open(SRC))


def make(uid: str, title: str, ds_uid: str, targets, transformations=None, max_data_points=None):
    d = copy.deepcopy(base)
    d["uid"] = uid
    d["title"] = title
    for p in d["panels"]:
        if "weathermap" not in p.get("type", ""):
            continue
        p["datasource"] = {"uid": ds_uid}
        p["targets"] = targets
        if transformations:
            p["transformations"] = transformations
        if max_data_points:
            p["maxDataPoints"] = max_data_points
    return d


FLUX = (
    'from(bucket: "wm")\n'
    "  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)\n"
    '  |> filter(fn: (r) => r._measurement == "wm")\n'
    "  |> aggregateWindow(every: v.windowPeriod, fn: mean, createEmpty: false)"
)

influx = make(
    "wm-wan-influx",
    "WAN Demo — Utilization (InfluxDB)",
    "influxdb-wm",
    [{"refId": "A", "query": FLUX, "datasource": {"uid": "influxdb-wm"}}],
    # With a single label per frame Grafana displays `value <series>` —
    # strip the field-name prefix so the copied weathermap bindings match.
    [{"id": "renameByRegex", "options": {"regex": "^value (.*)$", "renamePattern": "$1"}}],
)

elastic = make(
    "wm-wan-elastic",
    "WAN Demo — Utilization (Elasticsearch)",
    "elastic-wm",
    [
        {
            "refId": "A",
            "query": "*",
            "timeField": "@timestamp",
            "datasource": {"uid": "elastic-wm"},
            "metrics": [{"id": "1", "type": "avg", "field": "value"}],
            "bucketAggs": [
                {
                    "id": "2",
                    "type": "terms",
                    "field": "series.keyword",
                    "settings": {"size": "300", "order": "asc", "orderBy": "_term", "min_doc_count": "1"},
                },
                {"id": "3", "type": "date_histogram", "field": "@timestamp", "settings": {"interval": "auto"}},
            ],
        }
    ],
    # ES frames are already named exactly by the series term. maxDataPoints
    # is capped: 204 series x N histogram buckets must stay under ES's
    # 65536-bucket search limit (204 x 251 ~= 51k).
    max_data_points=250,
)

zabbix = make(
    "wm-wan-zabbix",
    "WAN Demo — Utilization (Zabbix)",
    "zabbix-wm",
    [
        {
            "refId": "A",
            "datasource": {"uid": "zabbix-wm"},
            "queryType": "0",
            "group": {"filter": "WM"},
            "host": {"filter": "wm-sim"},
            "application": {"filter": ""},
            "itemTag": {"filter": ""},
            "item": {"filter": "/.*/"},
            "functions": [],
            "options": {
                "showDisabledItems": False,
                "skipEmptyValues": False,
                # Alignment merges all series into ONE wide frame, which binds
                # only its first field in the panel's per-frame mapping (#259).
                "disableDataAlignment": True,
                "useZabbixValueMapping": False,
            },
        }
    ],
    # Zabbix item names ARE the series display names — no transformation.
)

for name, d in (("wm-wan-influx.json", influx), ("wm-wan-elastic.json", elastic), ("wm-wan-zabbix.json", zabbix)):
    json.dump(d, open(f"grafana/dashboards/{name}", "w"), indent=2)
    print("wrote", name)
