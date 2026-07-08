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

    # Permanently-down backup link (user feedback: SITE-DFW only flaps down
    # ~2min/10min, leaving the demo without a visible broken link most of the
    # time). RACK1-TOR port Gi1/0/7 is hard down in the simulator, so this
    # backup path always shows the DOWN state: purple dashed line, static ✕
    # badges, DOWN labels — right next to the animated primary.
    import copy as _copy

    primary = next(l for l in wm["links"] if l["id"] == "link-edge-1<->site-dfw")
    backup = _copy.deepcopy(primary)
    backup["id"] = "link-edge-1<->site-dfw/backup"
    backup["statusQuery"] = "PORT Gi1/0/7"
    backup["statusDownColor"] = "#8F3BB8"
    backup["sides"]["A"]["portLabel"] = "GigabitEthernet0/9 (backup)"
    # Offset the backup's labels along the link so they don't overlap the
    # primary's labels on the parallel pair.
    backup["sides"]["A"]["labelOffset"] = 30
    backup["sides"]["Z"]["labelOffset"] = 30
    for node in wm["nodes"]:
        if node["id"] in (primary["nodes"][0]["id"], primary["nodes"][1]["id"]):
            side = "A" if node["id"] == primary["nodes"][0]["id"] else "Z"
            anchor = str(primary["sides"][side]["anchor"])
            node["anchors"][anchor]["numLinks"] += 1
    wm["links"].append(backup)
    panel["targets"].append(
        {
            "refId": "G",
            "expr": 'wm_port_status{device="RACK1-TOR", port="Gi1/0/7"}',
            "legendFormat": "PORT {{port}}",
            "range": True,
            "format": "time_series",
        }
    )

    # No dashboard-level legend: the plugin renders its own animation legend
    # automatically while animation is active (settings.animation.showLegend).

out = os.path.join(ROOT, "wm-animated-traffic.json")
with open(out, "w") as f:
    json.dump(dashboard, f, indent=2)
    f.write("\n")
print(f"wrote {os.path.normpath(out)}")
