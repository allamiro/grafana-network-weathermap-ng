#!/usr/bin/env python3
"""Generate the animated traffic-flow demo dashboard (#264/#273).

Clones WAN Demo — Utilization verbatim (same nodes, links, bindings, and
simulated metrics, so low/medium/high/idle/down links all appear) and turns
on the traffic-flow particle animation. One link opts out via the per-link
override to demonstrate it.

Run from the repo root:  python3 testing/scripts/generate-animated-dashboard.py
"""

import copy
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), "..", "grafana", "dashboards")
BASE = json.load(open(os.path.join(ROOT, "wm-wan-utilization.json")))

dashboard = copy.deepcopy(BASE)
dashboard["uid"] = "wm-animated-traffic"
dashboard["title"] = "WAN Demo — Animated Traffic Flow"
dashboard["description"] = (
    "The WAN utilization demo with metric-driven traffic-flow particles (#273): "
    "dot speed and density follow per-side utilization, color inherits the "
    "threshold scale, idle/down links show no movement. Animation is opt-in "
    "and disabled by default on new panels."
)
dashboard["tags"] = ["weathermap", "demo", "animation"]
dashboard["version"] = 1

for panel in dashboard["panels"]:
    if panel.get("type") != "tamirsuliman-weathermap-panel":
        continue
    panel["title"] = "WAN — animated traffic flow (particles follow utilization)"
    wm = panel["options"]["weathermap"]
    wm["id"] = "wm-animated-traffic"
    wm["settings"]["animation"] = {
        "enabled": True,
        "respectReducedMotion": True,
        "maxAnimatedLinks": 100,
        "pauseInEditMode": True,
    }
    # Demonstrate the per-link override: the first link never animates even
    # though the panel switch is on.
    if wm["links"]:
        wm["links"][0]["animation"] = "disabled"

out = os.path.join(ROOT, "wm-animated-traffic.json")
with open(out, "w") as f:
    json.dump(dashboard, f, indent=2)
    f.write("\n")
print(f"wrote {os.path.normpath(out)}")
