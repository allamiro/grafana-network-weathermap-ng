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
ZABBIX_API = os.environ.get("ZABBIX_API", "http://zabbix-web:8080/api_jsonrpc.php")
ZABBIX_SERVER = os.environ.get("ZABBIX_SERVER", "zabbix-server")
ZABBIX_PORT = int(os.environ.get("ZABBIX_PORT", "10051"))
ZABBIX_HOST = "wm-sim"
# SQL sinks (#297): the same samples land in a wm_metrics(time, series, value)
# table in both PostgreSQL and MySQL so their Grafana datasources render the
# identical map. Pure-Python drivers (pg8000 / pymysql) keep the image simple.
PG_HOST = os.environ.get("PG_HOST", "postgres-wm")
PG_PORT = int(os.environ.get("PG_PORT", "5432"))
PG_DB = os.environ.get("PG_DB", "wm")
PG_USER = os.environ.get("PG_USER", "wm")
PG_PASSWORD = os.environ.get("PG_PASSWORD", "wm")
MYSQL_HOST = os.environ.get("MYSQL_HOST", "mysql-wm")
MYSQL_PORT = int(os.environ.get("MYSQL_PORT", "3306"))
MYSQL_DB = os.environ.get("MYSQL_DB", "wm")
MYSQL_USER = os.environ.get("MYSQL_USER", "wm")
MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "wm")
# Keep the demo tables bounded (rolling window, like Influx/ES retention).
SQL_RETENTION_MIN = int(os.environ.get("SQL_RETENTION_MIN", "180"))
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
    "wm_link_status": lambda l: f"LINK {l.get('link','')}",
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



# ---------------------------------------------------------------------------
# Zabbix (#256): seed a trapper host whose item NAMES are the exact series
# display names (the Zabbix datasource shows item names as series names, so
# the verbatim-map binding trick keeps working), then push values with the
# zabbix_sender wire protocol.

import socket
import struct


def zbx_api(method, params, token=None):
    body = {"jsonrpc": "2.0", "method": method, "params": params, "id": 1}
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(ZABBIX_API, data=json.dumps(body).encode(), headers=headers)
    with urllib.request.urlopen(req, timeout=30) as r:
        out = json.load(r)
    if "error" in out:
        raise RuntimeError(f"zabbix api {method}: {out['error']}")
    return out["result"]


def zbx_seed(series_names):
    """Idempotently create hostgroup/host/trapper items; return series->key map."""
    token = zbx_api("user.login", {"username": "Admin", "password": "zabbix"})
    groups = zbx_api("hostgroup.get", {"filter": {"name": ["WM"]}}, token)
    gid = groups[0]["groupid"] if groups else zbx_api("hostgroup.create", {"name": "WM"}, token)["groupids"][0]
    hosts = zbx_api("host.get", {"filter": {"host": [ZABBIX_HOST]}}, token)
    hid = hosts[0]["hostid"] if hosts else zbx_api(
        "host.create", {"host": ZABBIX_HOST, "groups": [{"groupid": gid}]}, token
    )["hostids"][0]

    existing = {
        i["name"]: i["key_"]
        for i in zbx_api("item.get", {"hostids": hid, "output": ["name", "key_"]}, token)
    }
    keys = {}
    to_create = []
    for n, name in enumerate(sorted(series_names)):
        if name in existing:
            keys[name] = existing[name]
            continue
        key = f"wm.metric[{n:03d}]"
        keys[name] = key
        # type 2 = trapper, value_type 0 = float
        to_create.append({"name": name, "key_": key, "hostid": hid, "type": 2, "value_type": 0})
    if to_create:
        zbx_api("item.create", to_create, token)
        print(f"zabbix: created {len(to_create)} trapper items", flush=True)
    return keys


def zbx_send(keys, samples):
    data = [
        {"host": ZABBIX_HOST, "key": keys[name], "value": str(value)}
        for name, value in samples
        if name in keys
    ]
    payload = json.dumps({"request": "sender data", "data": data}).encode()
    packet = b"ZBXD\x01" + struct.pack("<Q", len(payload)) + payload
    with socket.create_connection((ZABBIX_SERVER, ZABBIX_PORT), timeout=10) as sock:
        sock.sendall(packet)
        header = sock.recv(13)
        (length,) = struct.unpack("<Q", header[5:13])
        resp = json.loads(sock.recv(length).decode())
    if "processed" not in resp.get("info", ""):
        raise RuntimeError(f"zabbix sender: {resp}")


ZBX_KEYS = None  # populated once the API is reachable


# ---------------------------------------------------------------------------
# SQL sinks (#297). One row per (time, series, value); Grafana queries it in
# "Time series" format with the series column as the metric label, so the
# copied weathermap bindings match by display name — same trick as the others.

import datetime

_pg_conn = None
_my_conn = None


def _reset_pg():
    global _pg_conn
    try:
        if _pg_conn is not None:
            _pg_conn.close()
    except Exception:
        pass
    _pg_conn = None


def _reset_my():
    global _my_conn
    try:
        if _my_conn is not None:
            _my_conn.close()
    except Exception:
        pass
    _my_conn = None


def pg_write(samples, now):
    global _pg_conn
    import pg8000.native
    if _pg_conn is None:
        _pg_conn = pg8000.native.Connection(
            user=PG_USER, password=PG_PASSWORD, host=PG_HOST, port=PG_PORT, database=PG_DB
        )
        _pg_conn.run(
            "CREATE TABLE IF NOT EXISTS wm_metrics "
            "(time timestamptz NOT NULL, series text NOT NULL, value double precision)"
        )
        _pg_conn.run("CREATE INDEX IF NOT EXISTS wm_metrics_time_series ON wm_metrics (time, series)")
    for s, v in samples:
        _pg_conn.run("INSERT INTO wm_metrics (time, series, value) VALUES (:t, :s, :v)", t=now, s=s, v=v)
    _pg_conn.run("DELETE FROM wm_metrics WHERE time < :cut",
                 cut=now - datetime.timedelta(minutes=SQL_RETENTION_MIN))


def my_write(samples, now):
    global _my_conn
    import pymysql
    if _my_conn is None or not _my_conn.open:
        _my_conn = pymysql.connect(
            host=MYSQL_HOST, port=MYSQL_PORT, user=MYSQL_USER,
            password=MYSQL_PASSWORD, database=MYSQL_DB, autocommit=True
        )
        with _my_conn.cursor() as cur:
            cur.execute(
                "CREATE TABLE IF NOT EXISTS wm_metrics "
                "(time DATETIME(3) NOT NULL, series VARCHAR(255) NOT NULL, value DOUBLE, "
                "INDEX wm_time_series (time, series))"
            )
    with _my_conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO wm_metrics (time, series, value) VALUES (%s, %s, %s)",
            [(now, s, v) for s, v in samples],
        )
        cur.execute("DELETE FROM wm_metrics WHERE time < %s",
                    (now - datetime.timedelta(minutes=SQL_RETENTION_MIN),))


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

        global ZBX_KEYS
        try:
            if ZBX_KEYS is None:
                ZBX_KEYS = zbx_seed([name for name, _ in samples])
            zbx_send(ZBX_KEYS, samples)
            ok.append("zabbix")
        except Exception as e:
            print(f"zabbix write error (will retry): {e}", flush=True)

        sql_now = datetime.datetime.now(datetime.timezone.utc)
        try:
            pg_write(samples, sql_now)
            ok.append("postgres")
        except Exception as e:
            _reset_pg()
            print(f"postgres write error (will retry): {e}", flush=True)

        try:
            my_write(samples, sql_now.replace(tzinfo=None))
            ok.append("mysql")
        except Exception as e:
            _reset_my()
            print(f"mysql write error (will retry): {e}", flush=True)

        print(f"forwarded {len(samples)} samples -> {'+'.join(ok) or 'none'}", flush=True)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
