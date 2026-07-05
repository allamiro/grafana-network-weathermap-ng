# OpenSky Network → Prometheus exporter

Live aviation feed for the demo environment (#274). Polls the
[OpenSky Network](https://opensky-network.org) REST API for real aircraft
positions and exposes them as Prometheus metrics, following the project's
standard demo architecture:

```text
Open data (OpenSky REST API, OAuth2)
  → custom Prometheus exporter (this directory, stdlib Python)
  → Prometheus scrape
  → Grafana query
  → Network Weathermap NG (route links; moving-entity overlay per #266)
```

## Setup

1. Create an API client in your OpenSky account settings.
2. Copy the env template and fill in the credentials (the real file is
   git-ignored — never commit it):

   ```sh
   cd testing
   cp .env.example .env
   ```

3. Start the stack with the opt-in profile (the default stack never spends
   API credits):

   ```sh
   docker compose --profile opensky up -d --build
   ```

4. Metrics: <http://localhost:9101/metrics>, scraped by the bundled
   Prometheus as job `opensky`.

## Credit budget

Standard API access grants **4,000 credits/day**. A `/states/all` call with a
bounding box under 25 square degrees costs 1 credit; the defaults (15 sq-deg
box, 30 s poll) spend ~2,880/day. Live remaining credits are exported as
`opensky_api_credits_remaining` (from the `X-Rate-Limit-Remaining` header) so
a dashboard stat panel can watch the budget. Feeding ADS-B data to OpenSky
unlocks a higher allowance — see their "Learn how to feed" documentation.

## Metrics

Feed health and aggregates:

| Metric | Meaning |
|---|---|
| `opensky_up` | last poll succeeded (1/0) |
| `opensky_api_credits_remaining` | remaining daily API credits |
| `opensky_aircraft_in_bbox` | aircraft inside the configured bounding box |
| `opensky_route_aircraft{route_id}` | aircraft currently inside a route corridor |

Per-entity series use the generic `moving_entity_*` scheme so the weathermap
moving-entity overlay (#266) stays domain-agnostic:

| Metric | Meaning |
|---|---|
| `moving_entity_progress_ratio{entity_id,route_id}` | 0..1 progress of the tracked aircraft along the corridor (schematic mode input) |
| `moving_entity_latitude{entity_id,mode="aircraft"}` | position, for a future geospatial mode |
| `moving_entity_longitude{entity_id,mode="aircraft"}` | position, for a future geospatial mode |
| `moving_entity_altitude_meters{entity_id}` | barometric altitude |
| `moving_entity_speed_mps{entity_id}` | ground speed |
| `moving_entity_heading_degrees{entity_id}` | true track |

Schematic-mode binding (`Airport A ── ✈ 61% ── Airport B`): query
`moving_entity_progress_ratio` with legend format `{{route_id}} progress` and
bind that display name in the panel. `entity_id` is the flight callsign
(ICAO 24-bit address when no callsign is broadcast).

## Route corridors

A route is an A→Z airport pair. An aircraft counts as "on route" when its
perpendicular distance to the corridor centerline is under
`OPENSKY_CORRIDOR_KM` (default 30 km); progress is its projection onto the
segment, clamped to 0..1. The exporter keeps following the same aircraft
while it stays inside the corridor, so progress moves smoothly instead of
jumping between corridor occupants.

Defaults are three corridors inside the default Benelux box (AMS-BRU,
AMS-DUS, BRU-DUS — dense overflight traffic, so values move even when no
flight is literally flying that city pair). Override via `OPENSKY_ROUTES`
(JSON, see `.env.example`), and keep custom bounding boxes under 25 square
degrees to stay at 1 credit per poll.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `OPENSKY_CLIENT_ID` | — | API client ID (required) |
| `OPENSKY_CLIENT_SECRET` | — | API client secret (required) |
| `OPENSKY_POLL_SECONDS` | `30` | poll interval (floor 15 s) |
| `OPENSKY_BBOX` | `49.5,2.5,52.5,7.5` | `lamin,lomin,lamax,lomax` |
| `OPENSKY_CORRIDOR_KM` | `30` | corridor half-width |
| `OPENSKY_ROUTES` | 3 Benelux corridors | JSON route list |
| `OPENSKY_PORT` | `9101` | metrics port |

## Scope

Demo/testing infrastructure only — not part of the shipped plugin, not an
ADS-B receiver, and not flight-tracking software (see the scope boundaries
in #272). A failed poll marks `opensky_up 0` and the exporter keeps serving
metrics; it never crashes the stack.
