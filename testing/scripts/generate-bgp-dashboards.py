#!/usr/bin/env python3
"""
Generate the BGP demo dashboards (#294) for the testing stack:

  wm-bgp-neighbors.json   Weathermap "BGP Neighbor Map" — routers as nodes, BGP
                          sessions as links, session state as the link status
                          (dashed + ✕ + DOWN + blink when a peer drops), prefix
                          counts as labels, max-prefix fullness as the color.
  wm-bgp-detail.json      Per-router drill-down (stat + timeseries) reached by
                          clicking a node on the map.
  wm-bgp-overview.json    Fleet table: every session's state / prefixes / uptime.

Driven entirely by the exporter's normalized bgp_* series (bgp.go). Hand-edit
nothing under grafana/dashboards — rerun this script.

  python3 testing/scripts/generate-bgp-dashboards.py
"""
import copy
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DASH = os.path.join(HERE, "..", "grafana", "dashboards")
PROM = "${DS_PROMETHEUS}"

# --- Topology (mirrors the exporter's simBGPSessions) ---------------------- #
# node -> (x, y, icon, role)
NODES = {
    "TRANSIT-A": (170, 70, "cloud", "AS64500 upstream"),
    "PEER-X":    (440, 45, "cloud", "AS64502 IX peer"),
    "TRANSIT-B": (720, 70, "cloud", "AS64501 upstream"),
    "EDGE1":     (230, 210, "router", "AS65001 border (Juniper)"),
    "EDGE2":     (660, 210, "router", "AS65001 border (Juniper)"),
    "CORE1":     (350, 350, "router", "AS65001 RR (Cisco)"),
    "CORE2":     (560, 350, "router", "AS65001 RR (Cisco)"),
    "LB1":       (455, 470, "loadbalancer", "AS65001 F5 (VIP inject)"),
    "PEER-Y":    (860, 210, "cloud", "AS64503 peer (down)"),
}

# local, peer, afi, type, peer_as, limit, offset(parallel)
SESSIONS = [
    ("EDGE1", "TRANSIT-A", "ipv4", "ebgp", "64500", 1100000, -7),
    ("EDGE1", "TRANSIT-A", "ipv6", "ebgp", "64500", 300000, 7),
    ("EDGE1", "PEER-X",    "ipv4", "ebgp", "64502", 20000, 0),
    ("EDGE2", "PEER-Y",    "ipv4", "ebgp", "64503", 20000, 0),
    ("EDGE2", "TRANSIT-B", "ipv4", "ebgp", "64501", 1100000, -7),
    ("EDGE2", "TRANSIT-B", "ipv6", "ebgp", "64501", 300000, 7),
    ("CORE1", "EDGE1",     "ipv4", "ibgp", "65001", 0, 0),
    ("CORE2", "EDGE2",     "ipv4", "ibgp", "65001", 0, 0),
    ("CORE1", "CORE2",     "ipv4", "ibgp", "65001", 0, 0),
    ("CORE1", "LB1",       "ipv4", "ibgp", "65001", 0, 0),
]

NO_LIMIT_BW = 10000000  # large ref bw so no-limit sessions read green (headroom)


def dn(local, peer, afi, suffix):
    """Display name a target's legend produces, e.g. 'EDGE1>TRANSIT-A/ipv4 up'."""
    return f"{local}>{peer}/{afi} {suffix}"


def build_map(template_dash):
    panel = copy.deepcopy(
        [p for p in template_dash["panels"] if p.get("type", "").startswith("tamirsuliman")][0]
    )
    wm = panel["options"]["weathermap"]
    tmpl_node = copy.deepcopy(wm["nodes"][0])
    tmpl_link = copy.deepcopy(wm["links"][0])

    # Count links per node so anchor spacing distributes them.
    anchor_count = {n: 0 for n in NODES}
    for local, peer, *_ in SESSIONS:
        anchor_count[local] += 1
        anchor_count[peer] += 1

    nodes = []
    for name, (x, y, icon, role) in NODES.items():
        n = copy.deepcopy(tmpl_node)
        n["id"] = f"bgp-{name.lower()}"
        n["label"] = name
        n["position"] = [x, y]
        n["showLabel"] = True
        n.pop("statusQuery", None)
        n.pop("tooltipMetrics", None)
        # Apply the icon declared in the topology tuple — the template node is
        # a router, so clouds / the F5 would otherwise all render as routers.
        icon_file = {"cloud": "networking/cloud",
                     "router": "networking/router",
                     "loadbalancer": "vendors/f5-load-balancer"}.get(icon, "networking/router")
        n["nodeIcon"] = {
            "src": f"public/plugins/tamirsuliman-weathermap-panel/icons/{icon_file}.svg",
            "name": icon_file,
            "size": {"width": 32, "height": 32},
            "padding": {"vertical": 0, "horizontal": 0},
            "drawInside": False,
        }
        n["anchors"] = {str(i): {"numLinks": anchor_count[name] if i == 0 else 0,
                                 "numFilledLinks": 0} for i in range(5)}
        # Route the node's dashboard-link to the per-router detail dashboard.
        n["dashboardLink"] = f"/d/wm-bgp-detail/bgp-session-detail?var-node_name={name}"
        n["openInSameTab"] = False
        nodes.append(n)
    node_by = {n["label"]: n for n in nodes}

    links = []
    for local, peer, afi, typ, peer_as, limit, offset in SESSIONS:
        l = copy.deepcopy(tmpl_link)
        l["id"] = f"bgp-{local}-{peer}-{afi}".lower()
        l["nodes"] = [copy.deepcopy(node_by[local]), copy.deepcopy(node_by[peer])]
        l["units"] = "short"
        l["stroke"] = 4
        l["linkOffset"] = offset
        l["statusQuery"] = dn(local, peer, afi, "up")
        l["statusDownColor"] = "#8F3BB8"   # purple, off the green→red ramp
        l["statusBlink"] = True
        l["showThroughputPercentage"] = False
        bw = limit if limit > 0 else NO_LIMIT_BW
        l["sides"]["A"].update({
            "query": dn(local, peer, afi, "adv"), "bandwidth": bw, "bandwidthQuery": None,
            "labelOffset": 30, "anchor": 0, "directionLabel": "adv",
            "portLabel": f"AS{peer_as}", "dashboardLink": "",
        })
        l["sides"]["Z"].update({
            "query": dn(local, peer, afi, "recv"), "bandwidth": bw, "bandwidthQuery": None,
            "labelOffset": 70, "anchor": 0, "directionLabel": "recv",
            "portLabel": "", "dashboardLink": "",
        })
        l["tooltipMetrics"] = [
            {"label": "State (6=Established)", "queryA": dn(local, peer, afi, "state"),
             "queryZ": "", "units": "short"},
            {"label": "Uptime", "queryA": dn(local, peer, afi, "uptime"),
             "queryZ": "", "units": "s"},
            {"label": "Flaps", "queryA": dn(local, peer, afi, "flaps"),
             "queryZ": "", "units": "short"},
        ]
        links.append(l)

    wm["nodes"] = nodes
    wm["links"] = links
    wm["settings"]["scale"]["title"] = "Max-prefix %"
    wm["settings"]["colorScaleMode"] = "percent"
    wm["settings"]["link"]["defaultUnits"] = "short"
    wm["settings"]["animation"] = {
        "enabled": True, "respectReducedMotion": True, "pauseInEditMode": True,
        "maxAnimatedLinks": 100, "showLegend": True,
    }
    wm["scale"] = [
        {"percent": 0, "color": "#73BF69"}, {"percent": 60, "color": "#FADE2A"},
        {"percent": 80, "color": "#FF9830"}, {"percent": 90, "color": "#F2495C"},
        {"percent": 97, "color": "#C4162A"},
    ]

    # Panel targets: one series family per bgp_* metric, legends produce the
    # display names the links bind to.
    targets = []
    for refid, metric, suffix in [
        ("A", "bgp_prefixes_advertised", "adv"), ("B", "bgp_prefixes_received", "recv"),
        ("C", "bgp_session_up", "up"), ("D", "bgp_session_state", "state"),
        ("E", "bgp_session_uptime_seconds", "uptime"), ("F", "bgp_peer_flaps_total", "flaps"),
    ]:
        targets.append({
            "refId": refid, "datasource": {"type": "prometheus", "uid": "${DS_PROMETHEUS}"},
            "expr": metric, "legendFormat": "{{node_name}}>{{peer}}/{{afi}} " + suffix,
            "instant": False, "range": True,
        })
    panel["targets"] = targets
    panel["title"] = "BGP — neighbor map (session state · prefixes · max-prefix)"
    panel["gridPos"] = {"h": 20, "w": 24, "x": 0, "y": 0}

    return dashboard("wm-bgp-neighbors", "WAN Demo — BGP Neighbor Map", [panel],
                     tags=["bgp", "demo", "weathermap"],
                     desc="BGP neighbor status on a weathermap (#294): routers are nodes, BGP "
                          "sessions are links. Link status = session Established/down (dashed + ✕ "
                          "+ DOWN + blink on drop); labels = prefixes advertised/received; color = "
                          "max-prefix fullness (eBGP transits warm as they near the limit). Click a "
                          "router for its session detail.")


def stat_panel(pid, title, x, y, w, h, expr, unit="short", mappings=None, thresholds=None):
    p = {
        "id": pid, "type": "stat", "title": title, "datasource": PROM,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "targets": [{"refId": "A", "expr": expr, "instant": True,
                     "legendFormat": "{{node_name}}>{{peer}}/{{afi}}",
                     "datasource": {"type": "prometheus", "uid": "${DS_PROMETHEUS}"}}],
        "options": {"colorMode": "background", "graphMode": "none", "justifyMode": "auto",
                    "textMode": "value_and_name",
                    "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False}},
        "fieldConfig": {"defaults": {"unit": unit, "mappings": mappings or [],
                                     "thresholds": thresholds or {"mode": "absolute",
                                                                  "steps": [{"color": "green", "value": None}]}},
                        "overrides": []},
    }
    return p


def ts_panel(pid, title, x, y, w, h, expr, unit="short"):
    return {
        "id": pid, "type": "timeseries", "title": title, "datasource": PROM,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "targets": [{"refId": "A", "expr": expr, "legendFormat": "{{peer}}/{{afi}}",
                     "datasource": {"type": "prometheus", "uid": "${DS_PROMETHEUS}"}}],
        "fieldConfig": {"defaults": {"unit": unit, "custom": {"drawStyle": "line",
                        "fillOpacity": 8, "showPoints": "never"}}, "overrides": []},
        "options": {"legend": {"displayMode": "table", "placement": "bottom",
                    "calcs": ["lastNotNull", "min", "max"]}, "tooltip": {"mode": "multi"}},
    }


UP_MAP = [{"type": "value", "options": {"0": {"text": "DOWN", "color": "red"},
                                        "1": {"text": "Established", "color": "green"}}}]
UP_THRESH = {"mode": "absolute", "steps": [{"color": "red", "value": None},
                                           {"color": "green", "value": 1}]}
STATE_MAP = [{"type": "value", "options": {
    "1": {"text": "Idle", "color": "red"}, "2": {"text": "Connect", "color": "orange"},
    "3": {"text": "Active", "color": "orange"}, "4": {"text": "OpenSent", "color": "yellow"},
    "5": {"text": "OpenConfirm", "color": "yellow"}, "6": {"text": "Established", "color": "green"}}}]


def build_detail():
    node = "${node_name}"
    f = f'{{node_name=~"{node}"}}'
    panels = [
        stat_panel(1, "Session state", 0, 0, 24, 4, f"bgp_session_up{f}",
                   mappings=UP_MAP, thresholds=UP_THRESH),
        ts_panel(2, "Prefixes received", 0, 4, 12, 8, f"bgp_prefixes_received{f}"),
        ts_panel(3, "Prefixes advertised", 12, 4, 12, 8, f"bgp_prefixes_advertised{f}"),
        ts_panel(4, "Session uptime", 0, 12, 12, 7, f"bgp_session_uptime_seconds{f}", unit="s"),
        ts_panel(5, "Peer flaps", 12, 12, 12, 7, f"bgp_peer_flaps_total{f}"),
    ]
    d = dashboard("wm-bgp-detail", "WAN Demo — BGP Session Detail", panels,
                  tags=["bgp", "demo"],
                  desc="Per-router BGP drill-down (#294), linked from the neighbor map. "
                       "Pick a router with the node_name variable.")
    d["templating"] = {"list": [{
        "name": "node_name", "type": "query", "datasource": PROM,
        "definition": "label_values(bgp_session_up, node_name)",
        "query": {"query": "label_values(bgp_session_up, node_name)", "refId": "A"},
        "refresh": 1, "includeAll": False, "multi": False, "current": {"text": "EDGE1", "value": "EDGE1"},
    }]}
    return d


def build_overview():
    # Fleet status table — one clean row per session from a single query, so it
    # is always correct (no cross-metric join). Answers "which neighbors are
    # down" at a glance; prefix volumes get their own bar gauge below.
    tbl = {
        "id": 1, "type": "table", "title": "BGP sessions — status", "datasource": PROM,
        "gridPos": {"h": 11, "w": 24, "x": 0, "y": 5},
        "targets": [
            {"refId": "A", "expr": "bgp_session_up", "instant": True, "format": "table",
             "datasource": {"type": "prometheus", "uid": "${DS_PROMETHEUS}"}},
        ],
        "transformations": [
            {"id": "organize", "options": {"excludeByName": {
                "Time": True, "job": True, "instance": True, "__name__": True, "peer_ip": True},
                "indexByName": {"node_name": 0, "peer": 1, "peer_as": 2, "afi": 3,
                                "session_type": 4, "vendor": 5, "Value": 6},
                "renameByName": {"Value": "Session", "node_name": "Router", "peer": "Peer",
                                 "peer_as": "Peer AS", "afi": "AFI", "session_type": "Type",
                                 "vendor": "Vendor"}}},
        ],
        "fieldConfig": {"defaults": {}, "overrides": [
            {"matcher": {"id": "byName", "options": "Session"},
             "properties": [{"id": "mappings", "value": UP_MAP},
                            {"id": "custom.cellOptions", "value": {"type": "color-background"}},
                            {"id": "thresholds", "value": UP_THRESH}]},
        ]},
        "options": {"showHeader": True, "sortBy": [{"displayName": "Session", "desc": False}]},
    }
    prefixes = {
        "id": 4, "type": "bargauge", "title": "Prefixes received per session", "datasource": PROM,
        "gridPos": {"h": 8, "w": 24, "x": 0, "y": 16},
        "targets": [{"refId": "A", "expr": "bgp_prefixes_received", "instant": True,
                     "legendFormat": "{{node_name}}>{{peer}}/{{afi}}",
                     "datasource": {"type": "prometheus", "uid": "${DS_PROMETHEUS}"}}],
        "options": {"orientation": "horizontal", "displayMode": "gradient",
                    "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False}},
        "fieldConfig": {"defaults": {"unit": "short", "thresholds": {"mode": "absolute", "steps": [
            {"color": "green", "value": None}, {"color": "yellow", "value": 500000},
            {"color": "red", "value": 950000}]}}, "overrides": []},
    }
    counts = stat_panel(2, "Sessions Established", 0, 0, 8, 5, "sum(bgp_session_up)")
    down = stat_panel(3, "Sessions down", 8, 0, 8, 5, "count(bgp_session_up) - sum(bgp_session_up)",
                      thresholds={"mode": "absolute", "steps": [
                          {"color": "green", "value": None}, {"color": "red", "value": 1}]})
    total = stat_panel(5, "Sessions total", 16, 0, 8, 5, "count(bgp_session_up)",
                       thresholds={"mode": "absolute", "steps": [{"color": "blue", "value": None}]})
    # Big, value-only KPI numbers.
    for s in (counts, down, total):
        s["options"]["textMode"] = "value"
        s["options"]["reduceOptions"]["calcs"] = ["lastNotNull"]
        s["fieldConfig"]["defaults"]["custom"] = {}
    return dashboard("wm-bgp-overview", "WAN Demo — BGP Fleet Overview",
                     [counts, down, total, tbl, prefixes],
                     tags=["bgp", "demo"],
                     desc="Fleet-wide BGP session status table + prefixes-received bar gauge (#294).")


def dashboard(uid, title, panels, tags, desc):
    return {
        "__inputs": [], "__requires": [], "annotations": {"list": []},
        "editable": True, "graphTooltip": 0, "id": None, "links": [],
        "panels": panels, "schemaVersion": 39, "style": "dark", "tags": tags,
        "templating": {"list": []}, "time": {"from": "now-1h", "to": "now"},
        "timepicker": {}, "timezone": "", "title": title, "uid": uid, "version": 0,
        "description": desc,
    }


def localize_datasources(obj):
    """Replace ${DS_PROMETHEUS} import placeholders with the provisioned
    datasource name. Provisioning never substitutes __inputs placeholders
    (that only happens in the manual import UI), so a provisioned dashboard
    carrying them fails with 'Datasource ${DS_PROMETHEUS} was not found'.
    The importable copies in tools/bgp/ keep the placeholders + __inputs."""
    if isinstance(obj, dict):
        ds = obj.get("datasource")
        if isinstance(ds, dict) and "${DS_PROMETHEUS}" in str(ds.get("uid", "")):
            obj["datasource"] = "Prometheus"
        elif isinstance(ds, str) and "${DS_PROMETHEUS}" in ds:
            obj["datasource"] = "Prometheus"
        for v in obj.values():
            localize_datasources(v)
    elif isinstance(obj, list):
        for v in obj:
            localize_datasources(v)


def main():
    tmpl = json.load(open(os.path.join(DASH, "wm-animated-traffic.json")))
    out = {
        "wm-bgp-neighbors.json": build_map(tmpl),
        "wm-bgp-detail.json": build_detail(),
        "wm-bgp-overview.json": build_overview(),
    }
    for fname, d in out.items():
        localize_datasources(d)
        # Import-only bookkeeping is meaningless on provisioned dashboards.
        d.pop("__inputs", None)
        d.pop("__requires", None)
        path = os.path.join(DASH, fname)
        with open(path, "w") as fh:
            json.dump(d, fh, indent=2)
        print(f"wrote {fname}: {d['title']}")


if __name__ == "__main__":
    main()
