#!/usr/bin/env python3
"""Generate the Polyline Links demo dashboard (#332).

Clones the WAN Utilization map and routes several links through waypoints so
they bend around the middle of the map instead of crossing it — the exact
overlap problem the feature solves. Only the link geometry differs from
wm-wan-utilization.

Run from testing/:  python3 scripts/generate-polyline-demo.py
"""
import copy
import json

base = json.load(open("grafana/dashboards/wm-wan-utilization.json"))
d = copy.deepcopy(base)
d["uid"] = "wm-polyline-links"
d["title"] = "WAN Demo — Polyline Links"
d["description"] = (
    "Links drawn as polylines through per-link waypoints (#332): one logical "
    "link bent around the map, with arrows, labels, and traffic animation "
    "following the path."
)
d["version"] = 0

panel = [p for p in d["panels"] if p.get("type", "").startswith("tamir")][0]
panel["title"] = "WAN Demo — Polyline Links"
wm = panel["options"]["weathermap"]

# The base map routes EDGE-2 <-> SITE-NYC through a VIA connection node
# (segments /a and /z). Merge them into ONE direct link first — the same
# operation as removeVia — so the waypointed NYC path demonstrates a true
# single-link polyline instead of bending only the second VIA segment.
seg_a = next(l for l in wm["links"] if l["id"] == "link-edge-2<->site-nyc/a")
seg_z = next(l for l in wm["links"] if l["id"] == "link-edge-2<->site-nyc/z")
conn_id = seg_a["nodes"][1]["id"]
merged = seg_a
merged["id"] = "link-edge-2<->site-nyc"
merged["nodes"] = [seg_a["nodes"][0], seg_z["nodes"][1]]
merged["sides"] = {"A": seg_a["sides"]["A"], "Z": seg_z["sides"]["Z"]}
wm["links"] = [l for l in wm["links"] if l["id"] != "link-edge-2<->site-nyc/z"]
wm["nodes"] = [n for n in wm["nodes"] if n["id"] != conn_id]

# Waypoints per link id, ordered A -> Z, in panel coordinates. Chosen to route
# the two site links around the edge routers instead of under them, and to
# bend the INET uplink around the map's top-right corner.
WAYPOINTS = {
    # EDGE-1 -> SITE-DFW crosses under SITE-ATL's label on the straight path;
    # bow it out to the left instead.
    "link-edge-1<->site-dfw": [{"x": 150, "y": 400}, {"x": 240, "y": 455}],
    # The (merged, direct) NYC link arcs wide to the right through two bends —
    # a single logical link tracing a curved geographic-style path.
    "link-edge-2<->site-nyc": [{"x": 765, "y": 395}, {"x": 745, "y": 475}],
    # CORE-B -> INET straight path would clip the CORE-B label; route it
    # around the top-right corner.
    "link-core-b<->inet": [{"x": 700, "y": 140}, {"x": 700, "y": 90}],
}

# Put the INET link's A/Z arrow junction on the long straight run before its
# corner so the demo shows clean arrowheads there.
MEET = {
    "link-core-b<->inet": 35,
}

# The EDGE-1 area stacks several value labels; let the collision solver spread
# them along their (now path-aware) links so the demo reads cleanly.
wm["settings"]["link"]["labelCollision"] = True

applied = 0
for link in wm["links"]:
    wps = WAYPOINTS.get(link["id"])
    if wps:
        link["waypoints"] = wps
        # Smooth the bends (#336) — the demo shows deliberate curved routes,
        # not zigzags. 18px reads clearly at this map scale.
        link["cornerRadius"] = 18
        applied += 1
    if link["id"] in MEET:
        link["arrowMeetPercent"] = MEET[link["id"]]

assert applied == len(WAYPOINTS), f"only matched {applied} of {len(WAYPOINTS)} links"

out = "grafana/dashboards/wm-polyline-links.json"
json.dump(d, open(out, "w"), indent=2)
print(f"wrote {out} ({applied} polyline links)")
