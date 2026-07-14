#!/usr/bin/env python3
"""OpenSky Network -> Prometheus exporter for the live aviation demo (#274).

Polls the OpenSky REST API (OAuth2 client-credentials) for aircraft state
vectors inside a bounding box. Feed health and aggregates use opensky_*
names; the per-aircraft series use the generic moving_entity_* scheme so the
weathermap's moving-entity overlay (#266) stays domain-agnostic:

  opensky_up                              last poll succeeded (1/0)
  opensky_api_credits_remaining           X-Rate-Limit-Remaining from the API
  opensky_aircraft_in_bbox                aircraft inside the bounding box
  opensky_route_aircraft{route_id}        aircraft currently inside a corridor
  moving_entity_progress_ratio{entity_id,route_id}  0..1 corridor progress
  moving_entity_latitude{entity_id,mode="aircraft"}  position (geospatial,
  moving_entity_longitude{entity_id,mode="aircraft"} for future map mode)
  moving_entity_altitude_meters{entity_id}
  moving_entity_speed_mps{entity_id}
  moving_entity_heading_degrees{entity_id}

Schematic mode binds progress_ratio per route (Grafana legend
{{route_id}} progress); the lat/lon/alt/heading series are exported now so
a later geospatial mode needs no exporter change.

Credit budget: a bounding box under 25 square degrees costs 1 credit per
/states/all call; the standard allowance is 4,000/day. The default 30s poll
spends ~2,880/day. Stdlib only, matching testing/bridge/bridge.py.
"""

import json
import math
import os
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

TOKEN_URL = (
    "https://auth.opensky-network.org/auth/realms/opensky-network"
    "/protocol/openid-connect/token"
)
STATES_URL = "https://opensky-network.org/api/states/all"

CLIENT_ID = os.environ.get("OPENSKY_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("OPENSKY_CLIENT_SECRET", "")
POLL_SECONDS = max(15, int(os.environ.get("OPENSKY_POLL_SECONDS", "30")))
PORT = int(os.environ.get("OPENSKY_PORT", "9101"))
# lamin,lomin,lamax,lomax — default is a 15 sq-deg box over the Benelux /
# west-Germany corridor (dense traffic, 1 credit per call).
BBOX = [float(v) for v in os.environ.get("OPENSKY_BBOX", "49.5,2.5,52.5,7.5").split(",")]
# Perpendicular distance from the corridor centerline within which an
# aircraft counts as "on route".
CORRIDOR_KM = float(os.environ.get("OPENSKY_CORRIDOR_KM", "30"))

# Route corridors as airport pairs inside the default bbox. Override with
# OPENSKY_ROUTES='[{"route":"AMS-BRU","a":[52.31,4.76],"z":[50.90,4.48]}]'.
DEFAULT_ROUTES = [
    {"route": "AMS-BRU", "a": [52.31, 4.76], "z": [50.90, 4.48]},
    {"route": "AMS-DUS", "a": [52.31, 4.76], "z": [51.29, 6.77]},
    {"route": "BRU-DUS", "a": [50.90, 4.48], "z": [51.29, 6.77]},
]
ROUTES = json.loads(os.environ.get("OPENSKY_ROUTES", "")) if os.environ.get("OPENSKY_ROUTES") else DEFAULT_ROUTES

KM_PER_DEG = 111.32

state_lock = threading.Lock()
metrics = {
    "up": 0,
    "credits": float("nan"),
    "aircraft_in_bbox": 0,
    # route -> {"aircraft": n, "progress": p, "velocity": v} (progress/velocity
    # omitted when no aircraft is tracked on the corridor)
    "routes": {},
}
# route -> icao24 of the aircraft currently tracked, so progress follows one
# aircraft across polls instead of jumping between corridor occupants.
tracked = {}

token_cache = {"token": None, "expires_at": 0.0}


def get_token():
    now = time.time()
    if token_cache["token"] and now < token_cache["expires_at"] - 60:
        return token_cache["token"]
    body = urllib.parse.urlencode(
        {
            "grant_type": "client_credentials",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        }
    ).encode()
    req = urllib.request.Request(
        TOKEN_URL, data=body, headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        payload = json.loads(resp.read())
    token_cache["token"] = payload["access_token"]
    token_cache["expires_at"] = now + float(payload.get("expires_in", 1800))
    return token_cache["token"]


def fetch_states():
    params = urllib.parse.urlencode(
        {"lamin": BBOX[0], "lomin": BBOX[1], "lamax": BBOX[2], "lomax": BBOX[3]}
    )
    req = urllib.request.Request(
        f"{STATES_URL}?{params}", headers={"Authorization": f"Bearer {get_token()}"}
    )
    try:
        resp = urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as err:
        if err.code == 401:
            # Token invalidated server-side before its stated expiry: refetch once.
            token_cache["token"] = None
            req = urllib.request.Request(
                f"{STATES_URL}?{params}", headers={"Authorization": f"Bearer {get_token()}"}
            )
            resp = urllib.request.urlopen(req, timeout=20)
        else:
            raise
    with resp:
        credits = resp.headers.get("X-Rate-Limit-Remaining")
        payload = json.loads(resp.read())
    return payload.get("states") or [], credits


def project_km(lat, lon, ref_lat):
    """Equirectangular projection good enough for <500 km corridors."""
    return lon * KM_PER_DEG * math.cos(math.radians(ref_lat)), lat * KM_PER_DEG


def corridor_position(route, lat, lon):
    """Return (progress 0..1, cross-track km) of a point along route a->z."""
    (a_lat, a_lon), (z_lat, z_lon) = route["a"], route["z"]
    ref = (a_lat + z_lat) / 2
    ax, ay = project_km(a_lat, a_lon, ref)
    zx, zy = project_km(z_lat, z_lon, ref)
    px, py = project_km(lat, lon, ref)
    dx, dy = zx - ax, zy - ay
    length_sq = dx * dx + dy * dy
    if length_sq == 0:
        return 0.0, float("inf")
    t = ((px - ax) * dx + (py - ay) * dy) / length_sq
    cross = abs((px - ax) * dy - (py - ay) * dx) / math.sqrt(length_sq)
    return t, cross


def update_routes(states):
    routes = {}
    for route in ROUTES:
        occupants = {}
        for s in states:
            icao24, callsign, lon, lat = s[0], s[1], s[5], s[6]
            baro_alt, on_ground, velocity, heading = s[7], s[8], s[9], s[10]
            if lat is None or lon is None or on_ground:
                continue
            t, cross = corridor_position(route, lat, lon)
            if cross <= CORRIDOR_KM and -0.05 <= t <= 1.05:
                occupants[icao24] = {
                    "progress": max(0.0, min(1.0, t)),
                    "cross": cross,
                    "entity_id": (callsign or "").strip() or icao24,
                    "lat": lat,
                    "lon": lon,
                    "altitude": baro_alt,
                    "speed": velocity,
                    "heading": heading,
                }
        entry = {"aircraft": len(occupants)}
        if occupants:
            # Keep following the previously tracked aircraft while it stays in
            # the corridor; otherwise adopt the one nearest the centerline.
            key = tracked.get(route["route"])
            if key not in occupants:
                key = min(occupants, key=lambda k: occupants[k]["cross"])
                tracked[route["route"]] = key
            entry["entity"] = occupants[key]
        else:
            tracked.pop(route["route"], None)
        routes[route["route"]] = entry
    return routes


def poll_loop():
    while True:
        try:
            states, credits = fetch_states()
            routes = update_routes(states)
            with state_lock:
                metrics["up"] = 1
                metrics["aircraft_in_bbox"] = len(states)
                metrics["routes"] = routes
                if credits is not None:
                    metrics["credits"] = float(credits)
        except Exception as err:  # noqa: BLE001 - any poll failure marks the feed down
            print(f"opensky poll failed: {err}", flush=True)
            with state_lock:
                metrics["up"] = 0
        time.sleep(POLL_SECONDS)


def render_metrics():
    with state_lock:
        up = metrics["up"]
        credits = metrics["credits"]
        in_bbox = metrics["aircraft_in_bbox"]
        routes = dict(metrics["routes"])
    lines = [
        "# HELP opensky_up Whether the last OpenSky poll succeeded.",
        "# TYPE opensky_up gauge",
        f"opensky_up {up}",
        "# HELP opensky_aircraft_in_bbox Aircraft inside the configured bounding box.",
        "# TYPE opensky_aircraft_in_bbox gauge",
        f"opensky_aircraft_in_bbox {in_bbox}",
    ]
    if not math.isnan(credits):
        lines += [
            "# HELP opensky_api_credits_remaining Remaining daily OpenSky API credits.",
            "# TYPE opensky_api_credits_remaining gauge",
            f"opensky_api_credits_remaining {credits}",
        ]
    lines += [
        "# HELP opensky_route_aircraft Aircraft currently inside the route corridor.",
        "# TYPE opensky_route_aircraft gauge",
    ]
    for name, entry in routes.items():
        lines.append(f'opensky_route_aircraft{{route_id="{name}"}} {entry["aircraft"]}')

    entities = {
        name: entry["entity"] for name, entry in routes.items() if "entity" in entry
    }
    lines += [
        "# HELP moving_entity_progress_ratio Progress (0-1) of the tracked entity along its route.",
        "# TYPE moving_entity_progress_ratio gauge",
    ]
    for name, e in entities.items():
        lines.append(
            f'moving_entity_progress_ratio{{entity_id="{e["entity_id"]}",route_id="{name}"}}'
            f' {e["progress"]:.4f}'
        )
    scalar_fields = [
        ("moving_entity_latitude", "lat", "Latitude of the tracked entity.", 'mode="aircraft",'),
        ("moving_entity_longitude", "lon", "Longitude of the tracked entity.", 'mode="aircraft",'),
        ("moving_entity_altitude_meters", "altitude", "Barometric altitude in meters.", ""),
        ("moving_entity_speed_mps", "speed", "Ground speed in m/s.", ""),
        ("moving_entity_heading_degrees", "heading", "True track in degrees.", ""),
    ]
    # One aircraft can be tracked on several corridors; scalar series carry
    # only entity_id, so dedupe to avoid duplicate Prometheus samples.
    unique_entities = {e["entity_id"]: e for e in entities.values()}
    for metric, field, help_text, extra in scalar_fields:
        lines += [f"# HELP {metric} {help_text}", f"# TYPE {metric} gauge"]
        for e in unique_entities.values():
            if e.get(field) is not None:
                lines.append(f'{metric}{{{extra}entity_id="{e["entity_id"]}"}} {e[field]:.4f}')
    return "\n".join(lines) + "\n"


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 - http.server API
        if self.path != "/metrics":
            self.send_response(404)
            self.end_headers()
            return
        body = render_metrics().encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; version=0.0.4")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):  # keep container logs to poll errors only
        pass


def main():
    if not CLIENT_ID or not CLIENT_SECRET:
        raise SystemExit(
            "OPENSKY_CLIENT_ID and OPENSKY_CLIENT_SECRET must be set "
            "(see testing/.env.example)"
        )
    threading.Thread(target=poll_loop, daemon=True).start()
    print(f"opensky exporter on :{PORT}, bbox={BBOX}, poll={POLL_SECONDS}s", flush=True)
    HTTPServer(("", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
