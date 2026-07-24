#!/usr/bin/env python3
"""Generate a combined data-center demo dashboard (#267 + #319).

One canvas showing BOTH generators' output, colored live from wm_port_status:
  - left:  a rack elevation of different devices (Generate Rack Elevation, #319)
           — switches with port faceplates, router, firewall, servers.
  - right: a 24-port switch faceplate for RACK1-TOR (Generate Port Grid, #267)
           — odd/even ordering with block gaps.

The node math mirrors src/rackGenerator.ts + src/gridGenerator.ts. Run from
testing/:  python3 scripts/generate-datacenter-demo.py
"""
import copy
import json
import math

UP, DOWN = "#73BF69", "#F2495C"


def r(x):
    """Round half up, matching JS Math.round (src/rackGenerator.ts)."""
    return math.floor(x + 0.5)

base = json.load(open("grafana/dashboards/wm-rack-cabling.json"))
d = copy.deepcopy(base)
d["uid"] = "wm-datacenter"
d["title"] = "WAN Demo — Data Center (generated: rack + port board)"
d["description"] = (
    "Both node generators on one canvas, colored live from wm_port_status: a "
    "rack elevation of different devices (#319) beside a generated 24-port "
    "switch board for RACK1-TOR (#267)."
)
d["version"] = 0

panel = [p for p in d["panels"] if p.get("type", "").startswith("tamir")][0]
panel["title"] = "Data Center — generated rack elevation + port board"

# Two targets: device-qualified for the rack, port-only (RACK1-TOR) for the board.
panel["targets"] = [
    {"refId": "A", "expr": 'wm_port_status{device=~"R-RTR|R-FW|R-SW1|R-SW2|SRV-1|SRV-2|SRV-3"}',
     "legendFormat": "PORT {{device}} {{port}}", "range": True, "format": "time_series"},
    {"refId": "B", "expr": 'wm_port_status{device="RACK1-TOR"}',
     "legendFormat": "PORT {{port}}", "range": True, "format": "time_series"},
]

wm = panel["options"]["weathermap"]
template = copy.deepcopy(wm["nodes"][0])


_uid = 0


def mk(label, pos, sq=None, pad=(10, 6), show=True):
    global _uid
    _uid += 1
    n = copy.deepcopy(template)
    n["id"] = f"dc-{_uid}"
    n["position"] = [pos[0], pos[1]]
    n["label"] = label
    n["showLabel"] = show
    n["padding"] = {"horizontal": pad[0], "vertical": pad[1]}
    n["nodeIcon"] = {"src": "", "name": "", "size": {"width": 0, "height": 0},
                     "padding": {"vertical": 0, "horizontal": 0}, "drawInside": False}
    if sq:
        n["statusQuery"] = sq
        n["statusValueMappings"] = [{"value": 0, "color": DOWN}, {"value": 1, "color": UP}]
        n["nodeStatusColorTarget"] = "background"
    else:
        n.pop("statusQuery", None)
        n.pop("statusValueMappings", None)
    return n


nodes = []

# --- left: rack elevation (#319), hybrid chassis (#321) --------------------
RACK_UNITS, U_PX, LABEL_W, PH, PV, RX, RY = 12, 40, 80, 32, 26, 110, 100
RAIL_W, RAIL_GAP = 18, 5
DEVICES = [
    ("R-SW1", 10, 2, 8, "Gi0/{n}", "PORT R-SW1 Gi0/{n}"),
    ("R-SW2", 8, 2, 8, "Gi0/{n}", "PORT R-SW2 Gi0/{n}"),
    ("R-RTR", 6, 1, 4, "Ge0/{n}", "PORT R-RTR Ge0/{n}"),
    ("R-FW", 5, 1, 4, "P{n}", "PORT R-FW P{n}"),
    ("SRV-1", 3, 1, 0, "", "PORT SRV-1 eth0"),
    ("SRV-2", 2, 1, 0, "", "PORT SRV-2 eth1"),
    ("SRV-3", 1, 1, 0, "", "PORT SRV-3 ilo"),
]


def transparent(n):
    n["colors"] = {**n["colors"], "background": "transparent", "border": "transparent"}
    return n


BODY_CX = RX + LABEL_W / 2
FACE_X = RX + LABEL_W + RAIL_GAP + RAIL_W + 46
for label, u, height, pcount, plabel, ptmpl in DEVICES:
    top_u = u + height - 1
    top_y = RY + (RACK_UNITS - top_u) * U_PX
    center_y = top_y + (height * U_PX) / 2

    # Uniform full-width bar (neutral for port devices, colored for device status).
    bar = mk("", [BODY_CX, center_y], sq=None if pcount > 0 else ptmpl,
             pad=(r(LABEL_W / 2), max(4, r(height * U_PX / 2) - 2)), show=False)
    nodes.append(bar)
    # Device name on top.
    name = transparent(mk(label, [BODY_CX, center_y], pad=(2, 2)))
    name["fontBold"] = True
    name["zIndex"] = 1
    nodes.append(name)

    if pcount > 0:
        py0 = center_y
        for i in range(pcount):
            nodes.append(mk(plabel.format(n=i + 1), [FACE_X + i * PH, py0],
                            sq=ptmpl.format(n=i + 1), pad=(2, 2)))

# U-position markers on the left rail.
MARKER_X = RX - RAIL_GAP - RAIL_W / 2
for uu in range(1, RACK_UNITS + 1):
    cy = RY + (RACK_UNITS - uu) * U_PX + U_PX / 2
    m = transparent(mk(f"U{uu}", [MARKER_X, cy], pad=(2, 1)))
    m["fontSize"] = 9
    m["zIndex"] = 1
    nodes.append(m)

# Chassis: outer frame + two mounting rails behind the equipment.
RACK_CY = RY + (RACK_UNITS * U_PX) / 2
RACK_HALF_H = r(RACK_UNITS * U_PX / 2)


def rail(cx):
    n = mk("", [cx, RACK_CY], pad=(r(RAIL_W / 2), RACK_HALF_H), show=False)
    n["colors"] = {**n["colors"], "background": "transparent"}
    n["zIndex"] = -1
    return n


left_rail = rail(RX - RAIL_GAP - RAIL_W / 2)
right_rail = rail(RX + LABEL_W + RAIL_GAP + RAIL_W / 2)
frame_left = RX - RAIL_GAP - RAIL_W - 6
frame_right = RX + LABEL_W + RAIL_GAP + RAIL_W + 6
frame = mk("", [(frame_left + frame_right) / 2, RACK_CY],
           pad=(r((frame_right - frame_left) / 2), RACK_HALF_H + 5), show=False)
frame["colors"] = {**frame["colors"], "background": "transparent"}
frame["zIndex"] = -2
nodes = [frame, left_rail, right_rail] + nodes

# --- right: generated 24-port board for RACK1-TOR (#267) -------------------
BX, BY, HS, VS, GS, GG = 760, 250, 46, 34, 6, 18
nodes.append(mk("RACK1-TOR — 24-port board", [BX + 240, BY - 60], pad=(8, 5)))
for i in range(24):
    port = i + 1
    row, col = i % 2, i // 2               # odd/even
    x = BX + col * HS + (col // GS) * GG   # block gaps
    y = BY + row * VS
    nodes.append(mk(f"Gi1/0/{port}", [x, y], sq=f"PORT Gi1/0/{port}", pad=(4, 4)))

wm["nodes"] = nodes
wm["links"] = []
wm["scale"] = []
wm["settings"]["scale"]["title"] = ""
wm["settings"]["panel"].pop("backgroundImage", None)
wm["settings"]["panel"]["panelSize"] = {"width": 1400, "height": 640}

with open("grafana/dashboards/wm-datacenter.json", "w") as f:
    json.dump(d, f, indent=2)
print(f"wrote wm-datacenter.json — {len(nodes)} nodes")
