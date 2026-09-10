#!/usr/bin/env python3
"""Generate the Layer Visibility demo dashboard (#269).

Clones the rear-view rack cabling map — the densest demo in the set, 69 nodes
and 27 cables in one panel — and labels the network ports on top of it, so all
three label layers compete for the same strip of canvas. That is the state
#269 describes: everything you need on the map is on the map, and it is
unreadable.

The dashboard ships with every layer VISIBLE on purpose. It is the "before"
picture; the reader turns layers off in Panel Options → Layers and watches the
map become legible without editing (or losing) a single label.

Run from testing/:  python3 scripts/generate-layers-demo.py
"""
import copy
import json

base = json.load(open("grafana/dashboards/wm-rack-cabling.json"))
d = copy.deepcopy(base)
d["uid"] = "wm-layer-visibility"
d["title"] = "WAN Demo — Layer Visibility"
d["description"] = (
    "A deliberately over-labelled rack: port numbers on every node, live "
    "throughput on every cable, and interface names on both ends of the "
    "network runs. Use Panel Options → Layers to hide whole categories of "
    "label without deleting them (#269)."
)
d["version"] = 0
d["tags"] = sorted(set(d.get("tags", []) + ["layers"]))

panel = [p for p in d["panels"] if p.get("type", "").startswith("tamir")][0]
panel["title"] = "WAN Demo — Layer Visibility"
wm = panel["options"]["weathermap"]

# Interface names for the network runs, A side then Z side. The power cables
# are left unlabelled — a PDU outlet has no interface name, and the point of
# the demo is that the port-label layer covers exactly the links that carry
# one.
PORTS = {
    "link-rtr:1<->fw:1": ("Ge0/1", "eth1"),
    "link-fw:2<->sw1:1/0": ("eth2", None),
    "link-fw:2<->sw1:1/2": (None, "Gi1/0/1"),
    "link-sw1:8<->sw2:8": ("Gi1/0/8", "Gi1/0/8"),
    "link-sw1:2<->srv1:eth0/0": ("Gi1/0/2", None),
    "link-sw1:2<->srv1:eth0/2": (None, "eth0"),
    "link-sw1:3<->srv2:eth0/0": ("Gi1/0/3", None),
    "link-sw1:3<->srv2:eth0/2": (None, "eth0"),
    "link-sw2:2<->srv3:eth0/0": ("Gi1/0/2", None),
    "link-sw2:2<->srv3:eth0/2": (None, "eth0"),
    "link-sw2:3<->srv1:eth1/0": ("Gi1/0/3", None),
    "link-sw2:3<->srv1:eth1/2": (None, "eth1"),
}

# Push the port labels clear of the cable and of the port node they name.
# These are the per-side controls from #309; the cables here are short, so the
# labels sit close to the midpoint and well off the line.
PORT_LABEL_OFFSET = 18
PORT_LABEL_DISTANCE = 8

labelled = 0
by_id = {l["id"]: l for l in wm["links"]}
for link_id, (a_port, z_port) in PORTS.items():
    link = by_id.get(link_id)
    assert link is not None, f"link {link_id} is gone from the base map"
    for side, port in (("A", a_port), ("Z", z_port)):
        if not port:
            continue
        link["sides"][side]["portLabel"] = port
        link["sides"][side]["portLabelOffset"] = PORT_LABEL_OFFSET
        link["sides"][side]["portLabelDistance"] = PORT_LABEL_DISTANCE
        labelled += 1

assert labelled == 14, f"expected 14 port labels, wrote {labelled}"

# No settings.layers block: absent means every layer is visible, which is both
# the "before" picture and the proof that existing dashboards are untouched by
# this feature.
assert "layers" not in wm["settings"], "the demo must ship with layers at their defaults"

out = "grafana/dashboards/wm-layer-visibility.json"
json.dump(d, open(out, "w"), indent=2)
print(f"wrote {out} ({labelled} port labels over {len(wm['nodes'])} nodes)")
