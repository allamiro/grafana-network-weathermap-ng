#!/usr/bin/env python3
"""Generate the Polyline + Link Offset demo dashboard (#336).

Clones the parallel-LAG map and routes the whole three-member bundle through
the SAME waypoints, so each member keeps its own Link Offset while following a
bent path. That is the combination this demo exists to show: the offsets spread
the bundle apart, the waypoints bend it around the firewall pair, and the two
compose without distorting the shape — every member stays evenly spaced through
the corners, and its arrows, labels, and animation stay in step with the others.

Differences from wm-parallel-lag, all deliberate: the routing (shared waypoints
+ corner radius), the added obstacle node, the flow animation, and a set of
presentation changes needed to make the result legible at documentation scale —
a wider, shallower canvas with the endpoints moved apart, abbreviated port
labels, value labels pushed onto the straight middle run, and the dashboard's
own uid/title/description.

Run from testing/:  python3 scripts/generate-polyline-offset-demo.py
"""
import copy
import json

base = json.load(open("grafana/dashboards/wm-parallel-lag.json"))
d = copy.deepcopy(base)
d["uid"] = "wm-polyline-offset"
d["title"] = "WAN Demo — Polyline Links + Link Offset"
d["description"] = (
    "A three-member LAG (Link Offset -14 / 0 / +14) routed around the firewall "
    "pair through shared waypoints (#336): the whole bundle bends together, "
    "each member keeping its spacing, shape, and arc length through the corners."
)
d["version"] = 0

panel = [p for p in d["panels"] if p.get("type", "").startswith("tamir")][0]
panel["title"] = "WAN Demo — Polyline Links + Link Offset"
wm = panel["options"]["weathermap"]

# Composition: a wide, shallow map. The bundle needs a long horizontal run so
# the three members leave each node at a shallow angle — that is what keeps the
# per-member port labels from stacking on top of each other near the nodes.
wm["settings"]["panel"]["panelSize"] = {"width": 900, "height": 360}
panel["gridPos"] = {"h": 12, "w": 24, "x": 0, "y": 0}
NODE_Y = 270
for node, x in (("node-agg-a", 100), ("node-agg-b", 800)):
    n = next(v for v in wm["nodes"] if v["id"] == node)
    n["position"] = [x, NODE_Y]
# The link copies of each node carry their own stale positions; the renderer
# resolves endpoints from wm["nodes"] by id, but keep them consistent so the
# saved JSON reads correctly.
for link in wm["links"]:
    for embedded in link["nodes"]:
        live = next(v for v in wm["nodes"] if v["id"] == embedded["id"])
        embedded["position"] = list(live["position"])

# The obstruction the bundle routes around. No links and no status query — it
# is map furniture that makes the "why bend it at all" obvious in a screenshot.
obstacle = copy.deepcopy(wm["nodes"][0])
obstacle["id"] = "node-fw-pair"
obstacle["label"] = "FW-PAIR"
obstacle["position"] = [450, NODE_Y]
obstacle["anchors"] = {str(i): {"numLinks": 0, "numFilledLinks": 0} for i in range(5)}
obstacle["nodeIcon"] = copy.deepcopy(obstacle["nodeIcon"])
obstacle["nodeIcon"]["src"] = (
    "public/plugins/tamirsuliman-weathermap-panel/icons/networking/firewall.svg"
)
obstacle["nodeIcon"]["name"] = "networking/firewall"
obstacle.pop("statusQuery", None)
obstacle.pop("nodeStatusColorTarget", None)
obstacle["colors"] = copy.deepcopy(obstacle["colors"])
obstacle["colors"]["border"] = "#FF9830"
wm["nodes"].append(obstacle)

# One shared route for the whole bundle. The A->Z chord is horizontal, so the
# offsets shift each member vertically; bowing the route UP over the firewall
# keeps all three clear of it while the -14/0/+14 spacing is preserved through
# both corners.
WAYPOINTS = [{"x": 290, "y": 175}, {"x": 610, "y": 175}]
CORNER_RADIUS = 26

for link in wm["links"]:
    link["waypoints"] = copy.deepcopy(WAYPOINTS)
    link["cornerRadius"] = CORNER_RADIUS
    # Three members leaving one node 14px apart put their port labels within a
    # few pixels of each other; the short IOS-XR abbreviation keeps all three
    # legible at documentation scale.
    port = link["sides"]["A"].get("portLabel")
    if port:
        link["sides"]["A"]["portLabel"] = port.replace("TenGigE", "Te")
    # Push both value labels onto the straight middle run. At the default 55%
    # they land almost exactly on the two bends, where they collide with the
    # waypoint drag handles in edit mode and make both hard to read.
    for side in ("A", "Z"):
        link["sides"][side]["labelOffset"] = 82

# Traffic animation on: the demo GIF shows dots travelling around the bends on
# all three offset members at once.
wm["settings"]["link"]["flowAnimation"] = {"enabled": True, "speed": 2}

offsets = sorted(l.get("linkOffset", 0) for l in wm["links"])
assert offsets == [-14, 0, 14], f"unexpected LAG offsets: {offsets}"

out = "grafana/dashboards/wm-polyline-offset.json"
json.dump(d, open(out, "w"), indent=2)
print(f"wrote {out} ({len(wm['links'])} bent LAG members, offsets {offsets})")
