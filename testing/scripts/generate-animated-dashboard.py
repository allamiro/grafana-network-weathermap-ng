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
    # No per-link opt-out in the demo: disabling one of the parallel CORE
    # trunks read as "parallel links don't animate" (user feedback). The
    # override behavior is pinned by unit tests instead.

    # Down-state demo (#273): SITE-DFW's simulated device status cycles down,
    # so binding its link to the STATUS series shows the static ✕ markers —
    # traffic cannot flow on a down link, regardless of utilization color.
    for link in wm["links"]:
        if link["id"] == "link-edge-1<->site-dfw":
            link["statusQuery"] = "STATUS SITE-DFW"
            # Purple, deliberately off the green->red utilization ramp so a
            # down link can never be misread as "95-100% utilized".
            link["statusDownColor"] = "#8F3BB8"

    # No dashboard-level legend: the plugin renders its own animation legend
    # automatically while animation is active (settings.animation.showLegend).

out = os.path.join(ROOT, "wm-animated-traffic.json")
with open(out, "w") as f:
    json.dump(dashboard, f, indent=2)
    f.write("\n")
print(f"wrote {os.path.normpath(out)}")
