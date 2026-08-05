#!/usr/bin/env python3
"""Generate the Drag & Arrange editing playground.

A deliberately badly-arranged copy of the WAN map: three nodes are parked where
they crowd their neighbours and drag their links across each other. Nothing is
wrong with the data — the only problem is layout, which is exactly the problem
dragging solves, so the dashboard doubles as somewhere to practise the gesture
and see it commit.

The grid and its guides are ON so snapping is visible while dragging, which is
otherwise an invisible feature.

Run from testing/:  python3 scripts/generate-drag-demo.py
"""
import copy
import json

base = json.load(open("grafana/dashboards/wm-wan-utilization.json"))
d = copy.deepcopy(base)
d["uid"] = "wm-drag-arrange"
d["title"] = "WAN Demo — Drag & Arrange (editing playground)"
d["description"] = (
    "A deliberately messy layout for practising node dragging. Edit the panel "
    "(hover it and press 'e'), drag the crowded nodes apart, then Back to "
    "dashboard -> Save. Grid snapping and guides are on."
)
d["version"] = 0

panel = [p for p in d["panels"] if p.get("type", "").startswith("tamir")][0]
panel["title"] = "Drag the crowded nodes apart — edit the panel to begin"
wm = panel["options"]["weathermap"]

# Grid snapping ON with guides visible: dragging otherwise gives no feedback
# that snapping is happening at all.
wm["settings"]["panel"]["grid"] = {"enabled": True, "size": 20, "guidesEnabled": True}

# The mess. Each of these is a node parked somewhere that forces its links to
# cross a neighbour, and each is fixed by one drag.
#   EDGE-1   pulled right, so its SITE-ATL link rakes back across SITE-DFW
#   SITE-DFW pulled up-left into EDGE-1's other link
#   INET     pulled down onto CORE-B's shoulder
CRAMPED = {
    "node-edge-1": [430, 300],
    "node-site-dfw": [250, 420],
    "node-inet": [566, 96],
}
# Where a tidy layout puts them, for the docs to describe the exercise.
TIDY = {
    "node-edge-1": [220, 330],
    "node-site-dfw": [330, 480],
    "node-inet": [640, 60],
}

moved = 0
for node in wm["nodes"]:
    if node["id"] in CRAMPED:
        assert node["position"] == TIDY[node["id"]], (
            f"{node['id']} moved in the base map ({node['position']}); "
            f"update TIDY before regenerating"
        )
        node["position"] = list(CRAMPED[node["id"]])
        moved += 1

# Link objects embed a copy of their endpoint nodes; keep them consistent so
# the saved JSON reads correctly (the renderer resolves live nodes by id).
for link in wm["links"]:
    for embedded in link["nodes"]:
        if embedded["id"] in CRAMPED:
            embedded["position"] = list(CRAMPED[embedded["id"]])

assert moved == len(CRAMPED), f"only moved {moved} of {len(CRAMPED)} nodes"

out = "grafana/dashboards/wm-drag-arrange.json"
json.dump(d, open(out, "w"), indent=2)
print(f"wrote {out} ({moved} nodes parked badly, grid + guides on)")
