#!/usr/bin/env python3
"""Generate the Port Label Positioning demo dashboard (#309).

Clones the WAN Utilization map and sets per-side Port Label Offset % (along the
link axis) and Port Label Distance (perpendicular) on the interface labels, so
each label is lifted clear of its node icon — the exact overlap the feature
solves. Only the label placement differs from wm-wan-utilization.

Run from testing/:  python3 scripts/generate-port-label-demo.py
"""
import copy
import json

base = json.load(open("grafana/dashboards/wm-wan-utilization.json"))
d = copy.deepcopy(base)
d["uid"] = "wm-port-label-offset"
d["title"] = "WAN Demo — Port Label Positioning"
d["description"] = (
    "Port Label Offset % (along the link axis) and Port Label Distance "
    "(perpendicular to the line) placing each interface label clear of its "
    "node icon (#309)."
)
d["version"] = 0

panel = [p for p in d["panels"] if p.get("type", "").startswith("tamir")][0]
panel["title"] = "WAN Demo — Port Label Positioning"
wm = panel["options"]["weathermap"]

# (offset% along axis, distance px perpendicular) per link id — chosen to lift
# each label off the node/icon and show the full range of both controls.
PLACEMENT = {
    "link-core-a<->core-b/1": (28, 6),
    "link-core-a<->core-b/2": (28, -18),
    "link-core-a<->edge-1": (22, 26),
    "link-core-b<->edge-2": (22, 26),
    "link-edge-1<->site-atl": (18, 34),
    "link-edge-1<->site-dfw": (30, 10),
    "link-edge-2<->site-nyc/a": (18, 34),
    "link-core-b<->inet": (35, 0),
}

touched = 0
for link in wm["links"]:
    place = PLACEMENT.get(link["id"])
    if not place:
        continue
    off, dist = place
    for side in ("A", "Z"):
        if link["sides"][side].get("portLabel"):
            link["sides"][side]["portLabelOffset"] = off
            link["sides"][side]["portLabelDistance"] = dist
            touched += 1

with open("grafana/dashboards/wm-port-label-offset.json", "w") as f:
    json.dump(d, f, indent=2)
print(f"wrote wm-port-label-offset.json — {touched} port labels positioned")
