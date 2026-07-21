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
    # The two core trunks are parallel and close, with value labels clustered
    # at the centre — keep both port labels toward the CORE-A end and well
    # above/below the line so they clear the value labels.
    "link-core-a<->core-b/1": (14, 10),
    "link-core-a<->core-b/2": (14, -24),
    # CORE-A/CORE-B sit above their edge nodes with a device icon rendered over
    # the box, so slide these labels well toward the midpoint (offset) and lift
    # them off the line (distance) to clear the icon.
    "link-core-a<->edge-1": (40, 28),
    "link-core-b<->edge-2": (40, 28),
    "link-edge-1<->site-atl": (18, 34),
    # Slide past the near-end value label toward the midpoint and lift it off
    # the line so it stops overlapping EDGE-1's value label.
    "link-edge-1<->site-dfw": (44, 24),
    "link-edge-2<->site-nyc/a": (18, 34),
    # INET sits directly above CORE-B, so the long port label rides over
    # CORE-B's icon: slide toward the midpoint and push it off the line to the
    # right (negative distance) into open space, away from the CORE-B stack.
    "link-core-b<->inet": (25, -35),
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
