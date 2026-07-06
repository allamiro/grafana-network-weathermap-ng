#!/usr/bin/env python3
"""Generate the OpenSky live aviation dashboard (#266, #274).

Clones the panel/settings skeleton from wm-wan-utilization.json and swaps in
an AMS/BRU/DUS schematic driven by the OpenSky exporter's metrics:

  opensky_route_aircraft{route_id}        -> link values (single direction)
  moving_entity_progress_ratio{route_id}  -> moving-entity ✈ position (#266)

Run from the repo root:  python3 testing/scripts/generate-opensky-dashboard.py
"""

import copy
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), "..", "grafana", "dashboards")
BASE = json.load(open(os.path.join(ROOT, "wm-wan-utilization.json")))

base_panel = [p for p in BASE["panels"] if p.get("type") == "tamirsuliman-weathermap-panel"][0]
settings = copy.deepcopy(base_panel["options"]["weathermap"]["settings"])
settings["link"]["defaultUnits"] = "short"
settings["link"]["linkDecimals"] = 0
settings["panel"]["panelSize"] = {"width": 900, "height": 560}
settings["panel"]["backgroundImage"] = {
    "url": "http://localhost:9101/benelux.svg",
    "fit": "contain",
    "attachToCanvas": True,
}

ANCHORS = {str(i): {"numLinks": 0, "numFilledLinks": 0} for i in range(5)}

# Pixel positions from the exporter bbox projection (lon 2.5-7.5E,
# lat 49.5-52.5N onto the 900x560 canvas), matching benelux.svg — nodes sit
# at true geographic coordinates on the map background.
AIRPORTS = {
    "AMS": [407, 36],
    "BRU": [356, 299],
    "DUS": [769, 226],
}
ROUTES = [("AMS", "BRU"), ("AMS", "DUS"), ("BRU", "DUS")]


def make_node(code):
    return {
        "id": f"node-{code.lower()}",
        "position": AIRPORTS[code],
        "label": code,
        "showLabel": True,
        "anchors": copy.deepcopy(ANCHORS),
        "useConstantSpacing": False,
        "compactVerticalLinks": False,
        "padding": {"vertical": 6, "horizontal": 12},
        "colors": {
            "font": "#ffffff",
            "background": "#22252b",
            "border": "#5794F2",
            "statusDown": "#F2495C",
        },
        "nodeIcon": None,
        "isConnection": False,
    }


nodes = {code: make_node(code) for code in AIRPORTS}

links = []
entities = []
for a, z in ROUTES:
    route = f"{a}-{z}"
    # Both endpoints anchor at center; count both ends like the editor does.
    nodes[a]["anchors"]["0"]["numLinks"] += 1
    nodes[z]["anchors"]["0"]["numLinks"] += 1
    link = {
        "id": f"link-{route}",
        "nodes": [nodes[a], nodes[z]],
        "sides": {
            "A": {
                "bandwidth": 40,
                "query": f"{route} aircraft",
                "labelOffset": 55,
                "anchor": 0,
                "dashboardLink": "",
                "directionLabel": "Aircraft on route",
            },
            "Z": {
                "bandwidth": 40,
                "query": None,
                "labelOffset": 55,
                "anchor": 0,
                "dashboardLink": "",
            },
        },
        "units": "short",
        "arrows": {"width": 8, "height": 10, "offset": 2},
        "stroke": 6,
        "showThroughputPercentage": False,
        # One route-level aircraft count exists, not per-direction traffic.
        "singleDirection": True,
    }
    links.append(link)
    entities.append(
        {
            "id": f"entity-{route}",
            "label": route,
            "linkId": link["id"],
            "progressQuery": f"{route} progress",
            "icon": "✈",
            "size": 18,
            "showLabel": True,
        }
    )

weathermap = {
    "version": base_panel["options"]["weathermap"]["version"],
    "id": "wm-opensky-aviation",
    "nodes": list(nodes.values()),
    "links": links,
    "entities": entities,
    "scale": [
        {"percent": 0, "color": "#73BF69"},
        {"percent": 40, "color": "#FADE2A"},
        {"percent": 75, "color": "#F2495C"},
    ],
    "settings": settings,
}

wm_panel = {
    "datasource": "Prometheus",
    "gridPos": {"h": 15, "w": 16, "x": 0, "y": 2},
    "id": 1,
    "title": "Aviation routes — live OpenSky feed",
    "type": "tamirsuliman-weathermap-panel",
    "targets": [
        {
            "refId": "A",
            "expr": "opensky_route_aircraft",
            "legendFormat": "{{route_id}} aircraft",
            "range": True,
            "format": "time_series",
        },
        {
            "refId": "B",
            "expr": "moving_entity_progress_ratio",
            "legendFormat": "{{route_id}} progress",
            "range": True,
            "format": "time_series",
        },
    ],
    "options": {"weathermap": weathermap},
}


def stat(panel_id, x, title, expr, unit="none"):
    return {
        "datasource": "Prometheus",
        "gridPos": {"h": 2, "w": 8, "x": x, "y": 0},
        "id": panel_id,
        "title": title,
        "type": "stat",
        "targets": [{"refId": "A", "expr": expr, "range": False, "instant": True}],
        "fieldConfig": {"defaults": {"unit": unit}, "overrides": []},
        "options": {"colorMode": "value", "graphMode": "none", "reduceOptions": {"calcs": ["lastNotNull"]}},
    }


flights_table = {
    "datasource": "Prometheus",
    "gridPos": {"h": 15, "w": 8, "x": 16, "y": 2},
    "id": 5,
    "title": "Tracked flights",
    "type": "table",
    "targets": [
        {"refId": "A", "expr": "moving_entity_progress_ratio", "format": "table", "instant": True},
    ],
    "transformations": [
        {
            "id": "organize",
            "options": {
                "excludeByName": {"Time": True, "__name__": True, "instance": True, "job": True, "mode": True},
                "renameByName": {
                    "entity_id": "Flight",
                    "route_id": "Route",
                    "Value": "Progress",
                },
            },
        },
        {"id": "sortBy", "options": {"sort": [{"field": "Route"}]}},
    ],
    "fieldConfig": {
        "defaults": {"unit": "none", "decimals": 1},
        "overrides": [
            {
                "matcher": {"id": "byName", "options": "Progress"},
                "properties": [
                    {"id": "unit", "value": "percentunit"},
                    {"id": "custom.cellOptions", "value": {"type": "gauge", "mode": "gradient"}},
                    {"id": "min", "value": 0},
                    {"id": "max", "value": 1},
                ],
            }
        ],
    },
    "options": {},
}

dashboard = {
    "annotations": {"list": []},
    "editable": True,
    "graphTooltip": 0,
    "links": [],
    "refresh": "30s",
    "schemaVersion": 39,
    "tags": ["weathermap", "demo", "opensky"],
    "templating": {"list": []},
    "time": {"from": "now-30m", "to": "now"},
    "timepicker": {},
    "timezone": "browser",
    "title": "Aviation Demo — OpenSky Live",
    "description": (
        "Real aircraft from the OpenSky Network moving along schematic AMS/BRU/DUS "
        "route corridors. Requires the opensky compose profile "
        "(docker compose --profile opensky up)."
    ),
    "uid": "wm-opensky-aviation",
    "version": 1,
    "panels": [
        stat(2, 0, "Aircraft in bounding box", "opensky_aircraft_in_bbox"),
        stat(3, 8, "OpenSky API credits remaining", "opensky_api_credits_remaining"),
        stat(4, 16, "Feed up", "opensky_up"),
        wm_panel,
        flights_table,
    ],
}

out = os.path.join(ROOT, "wm-opensky-aviation.json")
with open(out, "w") as f:
    json.dump(dashboard, f, indent=2)
    f.write("\n")
print(f"wrote {os.path.normpath(out)}")
