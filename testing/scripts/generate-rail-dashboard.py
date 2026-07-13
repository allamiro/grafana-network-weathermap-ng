#!/usr/bin/env python3
"""Generate the Rail Operations demo dashboard (#300, Phase 5).

ALL SIGNALLING AND PLC-LIKE DATA IS SIMULATED (testing/exporter/rail.go) —
this demo is a monitoring-only visualization; it controls nothing.

Topology (matches the simulator's block/signal/switch ids exactly):

    Yard — Station A — Station B — Junction — Station C — East Terminal
                                     \\_ depot branch (t3-b01) — Depot

Two physical tracks (one segment per PHYSICAL track, never a shared link):
  Track 1, eastbound:  t1-b01 .. t1-b05  (upper line)
  Track 2, westbound:  t2-b01 .. t2-b05  (lower line)

Run from the repo root:  python3 testing/scripts/generate-rail-dashboard.py
"""

import json
import os

ROOT = os.path.join(os.path.dirname(__file__), "..", "grafana", "dashboards")
VERSION = 14  # weathermap schema version

PANEL_W, PANEL_H = 1200, 675
TRACK1_Y, TRACK2_Y = 285, 335  # upper (EB) and lower (WB) running lines
CP_Y = 310  # control points sit between the two tracks

BASELINE_URL = "public/plugins/tamirsuliman-weathermap-panel/img/rail/rail-plugin-base.svg"

CONTROL_POINTS = [
    {"id": "yard", "type": "yard", "position": [90, CP_Y], "label": "Yard", "shortLabel": "YD"},
    {"id": "st-a", "type": "station", "position": [290, CP_Y], "label": "Station A", "shortLabel": "A"},
    {"id": "st-b", "type": "station", "position": [490, CP_Y], "label": "Station B", "shortLabel": "B"},
    {"id": "jct", "type": "junction", "position": [690, CP_Y], "label": "Junction", "shortLabel": "JCT"},
    {"id": "st-c", "type": "station", "position": [890, CP_Y], "label": "Station C", "shortLabel": "C"},
    {"id": "term", "type": "terminal", "position": [1090, CP_Y], "label": "East Terminal", "shortLabel": "ET"},
    {"id": "depot", "type": "depot", "position": [840, 480], "label": "Depot", "shortLabel": "DEP"},
]

MAIN_LINE = ["yard", "st-a", "st-b", "jct", "st-c", "term"]


def x_of(cp_id):
    return next(cp["position"][0] for cp in CONTROL_POINTS if cp["id"] == cp_id)


def segment(seg_id, from_id, to_id, track, direction, y):
    """Main-line segment running along a track line between two control points."""
    # Via offsets follow the direction of travel, so westbound segments ramp
    # onto their line without a backwards hook at the endpoints.
    step = 25 if x_of(to_id) > x_of(from_id) else -25
    return {
        "id": seg_id,
        "fromControlPointId": from_id,
        "toControlPointId": to_id,
        "trackNumber": track,
        "direction": direction,
        "blockId": seg_id.upper(),
        "viaPoints": [[x_of(from_id) + step, y], [x_of(to_id) - step, y]],
        "occupancyQuery": f"OCC {seg_id}",
        "availabilityQuery": f"AVAIL {seg_id}",
    }


track_segments = []
# Track 1 eastbound (upper line): b01 yard->A ... b05 C->terminal.
for i in range(5):
    track_segments.append(
        segment(f"t1-b{i + 1:02d}", MAIN_LINE[i], MAIN_LINE[i + 1], "1", "eastbound", TRACK1_Y)
    )
# Track 2 westbound (lower line): b01 terminal->C ... b05 A->yard.
for i in range(5):
    track_segments.append(
        segment(f"t2-b{i + 1:02d}", MAIN_LINE[5 - i], MAIN_LINE[4 - i], "2", "westbound", TRACK2_Y)
    )
# Depot branch: bidirectional turnout from the junction.
track_segments.append(
    {
        "id": "t3-b01",
        "fromControlPointId": "jct",
        "toControlPointId": "depot",
        "trackNumber": "3",
        "direction": "bidirectional",
        "blockId": "T3-B01",
        "viaPoints": [[720, 400]],
        "occupancyQuery": "OCC t3-b01",
        "availabilityQuery": "AVAIL t3-b01",
    }
)

signals = [
    {
        "id": f"s{i + 1:02d}",
        "segmentId": f"t1-b{i + 1:02d}",
        "positionPercent": 0.85,
        "facingDirection": "eastbound",
        "stateQuery": f"SIG s{i + 1:02d}",
        "healthQuery": f"SIGH s{i + 1:02d}",
        "label": f"Signal s{i + 1:02d}",
    }
    for i in range(5)
]
# s06 guards track 2 at the terminal and has failed optics in the simulator.
signals.append(
    {
        "id": "s06",
        "segmentId": "t2-b01",
        "positionPercent": 0.15,
        "facingDirection": "westbound",
        "stateQuery": "SIG s06",
        "healthQuery": "SIGH s06",
        "label": "Signal s06 (failed optics — simulated)",
    }
)

switches = [
    {
        "id": "p1",
        "label": "P1 (crossover entry)",
        "controlPointId": "st-b",
        "normalSegmentId": "t1-b02",
        "reverseSegmentId": "t2-b04",
        "positionQuery": "SWPOS p1",
        "detectedQuery": "SWDET p1",
        "lockedQuery": "SWLOCK p1",
    },
    {
        "id": "p2",
        "label": "P2 (depot turnout)",
        "controlPointId": "jct",
        "normalSegmentId": "t1-b04",
        "reverseSegmentId": "t3-b01",
        "positionQuery": "SWPOS p2",
        "detectedQuery": "SWDET p2",
        "lockedQuery": "SWLOCK p2",
    },
]

crossovers = [
    {"id": "x1", "label": "Crossover A-B", "trackSegmentIds": ["t1-b02", "t2-b04"], "geometry": "double"}
]

trains = [
    {
        "id": train_id,
        "label": train_id,
        "segmentQuery": f"TRAIN {train_id}",
        "speedQuery": f"SPEED {train_id}",
        "delayQuery": f"DELAY {train_id}",
        "staleQuery": f"STALE {train_id}",
    }
    for train_id in ["RD-218", "RD-221", "RD-305", "RD-999"]
]

routes = [
    {
        "id": "route-eb",
        "label": "Eastbound corridor route",
        "segmentIds": [f"t1-b{i + 1:02d}" for i in range(5)],
        "stateQuery": "ROUTE route-eb",
    }
]

incidents = [
    {
        "id": "maint-b04",
        "kind": "maintenance",
        "label": "Track possession T1-B04 (simulated)",
        "segmentIds": ["t1-b04"],
    }
]

weathermap = {
    "version": VERSION,
    "id": "wm-rail-operations",
    "mapMode": "rail",
    "nodes": [],
    "links": [],
    "scale": [],
    "rail": {
        "controlPoints": CONTROL_POINTS,
        "trackSegments": track_segments,
        "signals": signals,
        "switches": switches,
        "crossovers": crossovers,
        "trains": trains,
        "routes": routes,
        "incidents": incidents,
        "layers": [],  # normalized to the default layer set at load
    },
    "settings": {
        "link": {
            "spacing": {"horizontal": 10, "vertical": 5},
            "stroke": {"color": "#7B8087"},
            "label": {"background": "#212124", "border": "#2c3235", "font": "#d8d9da"},
            "showAllWithPercentage": False,
            "valueMappingMode": "last",
        },
        "animation": {
            "enabled": True,
            "respectReducedMotion": True,
            "pauseInEditMode": True,
            "maxAnimatedLinks": 100,
            "showLegend": False,
        },
        "fontSizing": {"node": 10, "link": 8},
        "panel": {
            "backgroundColor": "#0b1020",
            "backgroundImage": {"url": BASELINE_URL, "fit": "contain", "attachToCanvas": True},
            "showTimestamp": True,
            "panelSize": {"width": PANEL_W, "height": PANEL_H},
            "zoomScale": 0,
            "offset": {"x": 0, "y": 0},
            "grid": {"enabled": False, "size": 10, "guidesEnabled": False},
        },
        "tooltip": {
            "fontSize": 10,
            "textColor": "white",
            "backgroundColor": "#111217",
            "inboundColor": "#00cf00",
            "outboundColor": "#fade2a",
            "scaleToBandwidth": False,
        },
        "scale": {
            "position": {"x": 0, "y": 0},
            "size": {"width": 50, "height": 200},
            "title": "Traffic Load",
            "fontSizing": {"title": 16, "threshold": 12},
        },
    },
}


def target(ref_id, expr, legend):
    return {
        "refId": ref_id,
        "expr": expr,
        "legendFormat": legend,
        "range": True,
        "format": "time_series",
    }


targets = [
    target("A", "wm_rail_track_occupied", "OCC {{segment_id}}"),
    target("B", "wm_rail_track_state", "AVAIL {{segment_id}}"),
    target("C", "wm_rail_signal_state", "SIG {{signal_id}}"),
    target("D", "wm_rail_signal_health", "SIGH {{signal_id}}"),
    target("E", "wm_rail_switch_position", "SWPOS {{switch_id}}"),
    target("F", "wm_rail_switch_detected", "SWDET {{switch_id}}"),
    target("G", "wm_rail_switch_locked", "SWLOCK {{switch_id}}"),
    target("H", "wm_rail_train_progress", "TRAIN {{train_id}} {{segment_id}}"),
    target("I", "wm_rail_train_speed_kmh", "SPEED {{train_id}}"),
    target("J", "wm_rail_train_delay_seconds", "DELAY {{train_id}}"),
    target("K", "wm_rail_stale", "STALE {{entity_id}}"),
    target("L", "wm_rail_route_established", "ROUTE {{route_id}}"),
]

dashboard = {
    "uid": "wm-rail-operations",
    "title": "Rail Operations Monitoring — Simulated Demo",
    "description": (
        "Monitoring-only Rail Operations mode demo (#300). Stations, tracks, "
        "signals, switches, crossovers, routes, and trains are plugin objects "
        "bound to SIMULATED telemetry from the demo exporter (rail.go). The "
        "static SVG background carries only grid/alignment context. This "
        "visualization issues no control commands of any kind."
    ),
    "tags": ["weathermap", "demo", "rail", "simulated"],
    "timezone": "browser",
    "schemaVersion": 39,
    "version": 1,
    "refresh": "5s",
    "time": {"from": "now-15m", "to": "now"},
    "panels": [
        {
            "id": 1,
            "type": "tamirsuliman-weathermap-panel",
            "title": "Rail Operations — Simulated (monitoring only)",
            "gridPos": {"h": 21, "w": 24, "x": 0, "y": 0},
            "datasource": "Prometheus",
            "targets": targets,
            "options": {"weathermap": weathermap},
        },
        {
            "id": 2,
            "type": "text",
            "title": "",
            "gridPos": {"h": 3, "w": 24, "x": 0, "y": 53},
            "options": {
                "mode": "markdown",
                "content": (
                    "**Simulated demo.** All signalling and PLC-like values come from the demo "
                    "exporter (`testing/exporter/rail.go`) and are labeled simulated. Rail "
                    "Operations mode is a **monitoring-only** visualization: it must not be used "
                    "to issue safety-critical railway control commands. Live states: `t1-b04` is "
                    "under maintenance possession, signal `s06` has failed optics, train `RD-999` "
                    "publishes stale telemetry, switch `p2` drops detection periodically."
                ),
            },
        },
    ],
}


def ts_panel(pid, title, expr, legend, y, x=0, w=12, h=8, unit=None, mappings=None, maxv=None):
    """Supporting telemetry panel (PLC-style readouts under the map)."""
    field_config = {
        "defaults": {
            "custom": {"lineWidth": 2, "fillOpacity": 12, "spanNulls": False},
            "min": 0,
        },
        "overrides": [],
    }
    if unit:
        field_config["defaults"]["unit"] = unit
    if maxv is not None:
        field_config["defaults"]["max"] = maxv
    if mappings:
        field_config["defaults"]["mappings"] = mappings
    return {
        "id": pid,
        "type": "timeseries",
        "title": title,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "datasource": "Prometheus",
        "targets": [target("A", expr, legend)],
        "fieldConfig": field_config,
    }


def stat_panel(pid, title, expr, legend, y, x=0, w=6, h=5, unit=None, mappings=None, thresholds=None):
    defaults = {"unit": unit or "none"}
    if mappings:
        defaults["mappings"] = mappings
    if thresholds:
        defaults["thresholds"] = thresholds
    return {
        "id": pid,
        "type": "stat",
        "title": title,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "datasource": "Prometheus",
        "targets": [target("A", expr, legend)],
        "options": {"reduceOptions": {"calcs": ["lastNotNull"]}, "textMode": "value_and_name"},
        "fieldConfig": {"defaults": defaults, "overrides": []},
    }


def value_map(entries):
    return [{"type": "value", "options": {str(k): {"text": v[0], "color": v[1]} for k, v in entries.items()}}]


SIGNAL_MAP = value_map({0: ("STOP", "red"), 1: ("CAUTION", "yellow"), 2: ("CLEAR", "green")})
SWITCH_MAP = value_map({0: ("NORMAL", "green"), 1: ("REVERSE", "blue"), 2: ("MOVING", "yellow")})
BOOL_ALARM_MAP = value_map({0: ("ALARM", "red"), 1: ("OK", "green")})
STALE_MAP = value_map({0: ("LIVE", "green"), 1: ("STALE", "purple")})
OCC_MAP = value_map({0: ("CLEAR", "green"), 1: ("OCCUPIED", "blue")})

telemetry_panels = [
    # Row 1 (y=24): train movement telemetry.
    ts_panel(10, "Train speed (simulated)", "wm_rail_train_speed_kmh", "{{train_id}}", 24, x=0, w=8, unit="km/h"),
    ts_panel(11, "Train delay (simulated)", "wm_rail_train_delay_seconds", "{{train_id}}", 24, x=8, w=8, unit="s"),
    ts_panel(
        12,
        "Train progress along current block",
        "wm_rail_train_progress",
        "{{train_id}} @ {{segment_id}}",
        24,
        x=16,
        w=8,
        maxv=1,
    ),
    # Row 2 (y=32): interlocking-style discrete states.
    stat_panel(13, "Signal aspects", "wm_rail_signal_state", "{{signal_id}}", 32, x=0, w=6, mappings=SIGNAL_MAP),
    stat_panel(14, "Signal health", "wm_rail_signal_health", "{{signal_id}}", 32, x=6, w=4, mappings=BOOL_ALARM_MAP),
    stat_panel(15, "Switch position", "wm_rail_switch_position", "{{switch_id}}", 32, x=10, w=4, mappings=SWITCH_MAP),
    stat_panel(16, "Switch detection", "wm_rail_switch_detected", "{{switch_id}}", 32, x=14, w=4, mappings=BOOL_ALARM_MAP),
    stat_panel(17, "Telemetry freshness", "wm_rail_stale", "{{entity_id}}", 32, x=18, w=6, mappings=STALE_MAP),
    # Row 3 (y=37): occupancy / availability history.
    ts_panel(18, "Block occupancy — Track 1 (eastbound)", 'wm_rail_track_occupied{track="1"}', "{{segment_id}}", 37, x=0, w=12, maxv=1, mappings=OCC_MAP),
    ts_panel(19, "Block occupancy — Track 2 (westbound)", 'wm_rail_track_occupied{track="2"}', "{{segment_id}}", 37, x=12, w=12, maxv=1, mappings=OCC_MAP),
    # Row 4 (y=45): availability + route state.
    ts_panel(20, "Block availability (0 = blocked/possession)", "wm_rail_track_state", "{{segment_id}}", 45, x=0, w=12, maxv=1),
    ts_panel(21, "Route established / telemetry age", "wm_rail_route_established or wm_rail_telemetry_age_seconds", "{{route_id}}{{source}}", 45, x=12, w=12),
]

dashboard["panels"].extend(telemetry_panels)

out = os.path.join(ROOT, "wm-rail-operations.json")
with open(out, "w") as f:
    json.dump(dashboard, f, indent=2)
    f.write("\n")
print(f"wrote {os.path.normpath(out)}")
