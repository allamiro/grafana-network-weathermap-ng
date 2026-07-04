#!/usr/bin/env python3
"""Forward the simulator's Prometheus metrics to InfluxDB and Elasticsearch.

Scrapes the exporter's /metrics every INTERVAL seconds, computes the same
series display names the Prometheus demo dashboards use in their legends,
and writes identical values to:
  - InfluxDB 2.x  (line protocol, measurement "wm", tag "series")
  - Elasticsearch (bulk index wm-metrics: @timestamp, series, value)

One source of truth -> three synchronized datasources, so the per-datasource
demo dashboards render the same map from the same numbers. Stdlib only.
"""
import json
import os
import re
import time
import urllib.request

EXPORTER = os.environ.get("EXPORTER_URL", "http://exporter:8080/metrics")
INFLUX = os.environ.get("INFLUX_URL", "http://influxdb:8086")
INFLUX_TOKEN = os.environ.get("INFLUX_TOKEN", "wm-token")
ES = os.environ.get("ES_URL", "http://elasticsearch:9200")
INTERVAL = float(os.environ.get("INTERVAL", "5"))

LINE = re.compile(r'^(\w+)\{([^}]*)\}\s+([-0-9.e+]+)$')
LABEL = re.compile(r'(\w+)="([^"]*)"')

# metric family -> display-name formula (must mirror the Prometheus
# dashboards' legendFormat strings).
SERIES = {
    "wm_link_bps": lambda l: f"{l.get('link','')} {l.get('direction','')}",
    "wm_device_status": lambda l: f"STATUS {l.get('device','')}",
    "wm_latency_ms": lambda l: f"LAT {l.get('device','')}",
    "wm_packet_loss_pct": lambda l: f"LOSS {l.get('device','')}",
    "wm_link_errors": lambda l: f"ERR {l.get('link','')}",
    "wm_link_discards": lambda l: f"DISC {l.get('link','')}",
    "wm_bandwidth_data": lambda l: f"BW {l.get('link','')} {l.get('type','')}".rstrip(),
}


def esc_tag(v: str) -> str:
    return v.replace("\\", "\\\\").replace(",", "\\,").replace(" ", "\\ ").replace("=", "\\=")


def post(url: str, data: bytes, headers: dict) -> int:
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status


def scrape():
    with urllib.request.urlopen(EXPORTER, timeout=10) as r:
        text = r.read().decode()
    out = []
    for line in text.splitlines():
        if line.startswith("#"):
            continue
        m = LINE.match(line.strip())
        if not m:
            continue
        name, labelstr, value = m.groups()
        if name not in SERIES:
            continue
        labels = dict(LABEL.findall(labelstr))
        out.append((SERIES[name](labels), float(value)))
    return out


def main():
    print(f"bridge: {EXPORTER} -> {INFLUX} + {ES} every {INTERVAL}s", flush=True)
    while True:
        try:
            samples = scrape()
        except Exception as e:  # exporter not up yet — nothing to forward
            print(f"scrape error (will retry): {e}", flush=True)
            time.sleep(INTERVAL)
            continue

        ts_ns = time.time_ns()
        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        ok = []

        # Independent error boundaries per sink: one backend being down must
        # not create a data gap in the other.
        try:
            lines = "\n".join(
                f"wm,series={esc_tag(s)} value={v} {ts_ns}" for s, v in samples
            )
            post(
                f"{INFLUX}/api/v2/write?org=wm&bucket=wm&precision=ns",
                lines.encode(),
                {"Authorization": f"Token {INFLUX_TOKEN}"},
            )
            ok.append("influx")
        except Exception as e:
            print(f"influx write error (will retry): {e}", flush=True)

        try:
            bulk = "".join(
                json.dumps({"index": {"_index": "wm-metrics"}}) + "\n"
                + json.dumps({"@timestamp": now_iso, "series": s, "value": v}) + "\n"
                for s, v in samples
            )
            post(f"{ES}/_bulk", bulk.encode(), {"Content-Type": "application/x-ndjson"})
            ok.append("es")
        except Exception as e:
            print(f"elasticsearch write error (will retry): {e}", flush=True)

        print(f"forwarded {len(samples)} samples -> {'+'.join(ok) or 'none'}", flush=True)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
