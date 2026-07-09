#!/usr/bin/env python3
"""
grafana-backup.py — back up and restore Grafana dashboards (with their data
sources and queries) so you can survive a Grafana upgrade.

Dashboards are saved as plain JSON — each file is the exact dashboard model,
including every panel's queries and its datasource references. Data sources are
saved alongside so the queries can resolve after a restore. Folder structure is
preserved.

Works against:
  * Grafana with authorization — API token / service-account token (--token)
    or basic auth (--user/--password)
  * Grafana with open/anonymous auth (no flags) — e.g. the demo stack on :3101

Usage
-----
  # Back up everything from an open-auth Grafana (anonymous admin)
  python3 tools/grafana-backup.py backup --url http://localhost:3101 --out ./grafana-backup

  # Back up from a secured Grafana with a service-account token
  python3 tools/grafana-backup.py backup --url https://grafana.example.com \
      --token "$GRAFANA_TOKEN" --out ./grafana-backup

  # Back up with basic auth
  python3 tools/grafana-backup.py backup --url https://grafana.example.com \
      --user admin --password admin --out ./grafana-backup

  # Restore into a freshly-upgraded Grafana
  python3 tools/grafana-backup.py restore --url http://localhost:3101 --in ./grafana-backup

Environment fallbacks: GRAFANA_URL, GRAFANA_TOKEN, GRAFANA_USER, GRAFANA_PASSWORD.

Notes
-----
  * Data source SECRETS (passwords, API keys) are write-only in Grafana's API
    and are NOT returned by the export — the config is captured, but you must
    re-enter secrets after a restore (or provide them; see --datasources on
    restore). This is a Grafana limitation, not a bug here.
  * Restore is idempotent: dashboards use overwrite, folders/datasources are
    created if missing and skipped if they already exist.
"""

import argparse
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request

TIMEOUT = 30


# --------------------------------------------------------------------------- #
# HTTP helpers
# --------------------------------------------------------------------------- #
def make_auth_header(args):
    if args.token:
        return {"Authorization": f"Bearer {args.token}"}
    if args.user:
        raw = f"{args.user}:{args.password or ''}".encode()
        return {"Authorization": "Basic " + base64.b64encode(raw).decode()}
    return {}  # anonymous / open auth


def api(args, path, method="GET", body=None):
    url = args.url.rstrip("/") + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    headers.update(make_auth_header(args))
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            payload = resp.read()
            return resp.status, (json.loads(payload) if payload else None)
    except urllib.error.HTTPError as e:
        payload = e.read()
        try:
            parsed = json.loads(payload)
        except Exception:
            parsed = payload.decode(errors="replace")
        return e.code, parsed
    except OSError as e:
        # URLError (connection refused, DNS failure) and raw socket timeouts
        # are all OSError subclasses. Status 0 = "could not reach Grafana at
        # all"; callers surface the reason instead of a raw traceback.
        reason = getattr(e, "reason", None) or e
        return 0, f"network error: {reason}"


def slugify(text, fallback="untitled"):
    text = (text or "").strip().lower()
    text = re.sub(r"[^a-z0-9._-]+", "-", text).strip("-")
    return text or fallback


# --------------------------------------------------------------------------- #
# Backup
# --------------------------------------------------------------------------- #
def backup(args):
    os.makedirs(args.out, exist_ok=True)
    dash_dir = os.path.join(args.out, "dashboards")
    os.makedirs(dash_dir, exist_ok=True)

    status, health = api(args, "/api/health")
    if status != 200:
        detail = health if status == 0 else f"HTTP {status}"
        die(f"Cannot reach Grafana at {args.url} ({detail}). Check --url and auth.")
    version = (health or {}).get("version", "unknown")
    print(f"Grafana {version} at {args.url}")

    # --- Folders ---------------------------------------------------------- #
    status, folders = api(args, "/api/folders?limit=1000")
    if status != 200 or not isinstance(folders, list):
        # Treating this as "no folders" would write a backup that looks good
        # but silently misses content — refuse to produce a false restore point.
        die(f"listing folders failed (HTTP {status}): {folders}")
    with open(os.path.join(args.out, "folders.json"), "w") as f:
        json.dump(folders, f, indent=2)
    folder_by_uid = {fo["uid"]: fo for fo in folders}
    print(f"  folders:      {len(folders)}")

    # --- Data sources (config only; secrets are not returned by the API) -- #
    status, datasources = api(args, "/api/datasources")
    if status != 200 or not isinstance(datasources, list):
        die(f"listing data sources failed (HTTP {status}): {datasources}")
    # Drop volatile ids; keep uid/name/type/access/url/jsonData etc.
    for ds in datasources:
        ds.pop("id", None)
        ds.pop("orgId", None)
        ds.pop("version", None)
    with open(os.path.join(args.out, "datasources.json"), "w") as f:
        json.dump(datasources, f, indent=2)
    print(f"  datasources:  {len(datasources)} "
          f"(config only — secrets are write-only in Grafana and not exported)")

    # --- Dashboards (paginated search) ------------------------------------ #
    manifest = {"grafana_version": version, "source_url": args.url,
                "folders": len(folders), "datasources": len(datasources),
                "dashboards": []}
    page, saved, failed = 1, 0, 0
    seen = set()
    while True:
        status, hits = api(args, f"/api/search?type=dash-db&limit=1000&page={page}")
        if status != 200:
            # A failed first page means the whole dashboard list is unknown —
            # that must fail the backup, not masquerade as "0 dashboards".
            die(f"dashboard search failed on page {page} (HTTP {status}): {hits}")
        if not hits:
            break
        new = [h for h in hits if h["uid"] not in seen]
        if not new:
            break
        for h in new:
            seen.add(h["uid"])
            uid = h["uid"]
            st, full = api(args, f"/api/dashboards/uid/{uid}")
            if st != 200 or not isinstance(full, dict) or "dashboard" not in full:
                print(f"    ! failed to fetch {uid} ({h.get('title')}) HTTP {st}")
                failed += 1
                continue
            model = full["dashboard"]
            meta = full.get("meta", {})
            model.pop("id", None)  # id is instance-specific; uid is the key
            folder_uid = meta.get("folderUid", "")
            folder_title = meta.get("folderTitle", "General")

            sub = os.path.join(dash_dir, slugify(folder_title, "general"))
            os.makedirs(sub, exist_ok=True)
            fname = f"{slugify(model.get('title'), uid)}__{uid}.json"
            with open(os.path.join(sub, fname), "w") as f:
                json.dump({"dashboard": model, "folderUid": folder_uid,
                           "folderTitle": folder_title}, f, indent=2)

            manifest["dashboards"].append({
                "uid": uid, "title": model.get("title"),
                "folderUid": folder_uid, "folderTitle": folder_title,
                "datasources": sorted(_dashboard_datasource_refs(model)),
                "file": os.path.relpath(os.path.join(sub, fname), args.out),
            })
            saved += 1
        page += 1

    with open(os.path.join(args.out, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"  dashboards:   {saved} saved" + (f", {failed} failed" if failed else ""))
    print(f"\nBackup written to {os.path.abspath(args.out)}")
    if failed:
        sys.exit(1)


def _dashboard_datasource_refs(model):
    """Collect datasource uids/names referenced by a dashboard's panels/targets."""
    refs = set()

    def visit(obj):
        if isinstance(obj, dict):
            ds = obj.get("datasource")
            if isinstance(ds, dict):
                refs.add(ds.get("uid") or ds.get("type") or "?")
            elif isinstance(ds, str):
                refs.add(ds)
            for v in obj.values():
                visit(v)
        elif isinstance(obj, list):
            for v in obj:
                visit(v)

    visit(model)
    refs.discard("?")
    return refs


# --------------------------------------------------------------------------- #
# Restore
# --------------------------------------------------------------------------- #
def restore(args):
    root = args.inp
    if not os.path.isdir(root):
        die(f"Backup directory not found: {root}")

    status, health = api(args, "/api/health")
    if status != 200:
        detail = health if status == 0 else f"HTTP {status}"
        die(f"Cannot reach Grafana at {args.url} ({detail}).")
    print(f"Restoring into Grafana {(health or {}).get('version','?')} at {args.url}")

    # --- Data sources ----------------------------------------------------- #
    ds_created = ds_skipped = ds_failed = 0
    ds_path = os.path.join(root, "datasources.json")
    if args.datasources and os.path.exists(ds_path):
        with open(ds_path) as f:
            for ds in json.load(f):
                st, _ = api(args, "/api/datasources", "POST", ds)
                if st in (200, 201):
                    ds_created += 1
                elif st == 409:  # already exists
                    ds_skipped += 1
                else:
                    print(f"    ! datasource '{ds.get('name')}' HTTP {st}")
                    ds_failed += 1
        tail = f", {ds_failed} FAILED" if ds_failed else ""
        print(f"  datasources:  {ds_created} created, {ds_skipped} already existed{tail}"
              f"  (re-enter any secrets in the Grafana UI)")

    # --- Folders (uid preserved so dashboards land in the right place) ---- #
    folder_uids = {}
    fo_failed = 0
    fo_path = os.path.join(root, "folders.json")
    if os.path.exists(fo_path):
        with open(fo_path) as f:
            for fo in json.load(f):
                st, res = api(args, "/api/folders", "POST",
                              {"uid": fo["uid"], "title": fo["title"]})
                if st in (200, 201):
                    folder_uids[fo["uid"]] = fo["uid"]
                elif st in (409, 412):
                    folder_uids[fo["uid"]] = fo["uid"]  # already there
                else:
                    print(f"    ! folder '{fo.get('title')}' HTTP {st}")
                    fo_failed += 1

    # --- Dashboards ------------------------------------------------------- #
    created = failed = skipped = 0
    dash_dir = os.path.join(root, "dashboards")
    for dirpath, _, files in os.walk(dash_dir):
        for name in sorted(files):
            if not name.endswith(".json"):
                continue
            with open(os.path.join(dirpath, name)) as f:
                doc = json.load(f)
            model = doc["dashboard"]
            model.pop("id", None)
            model["version"] = 0  # let the target assign fresh versions
            payload = {"dashboard": model, "overwrite": True,
                       "folderUid": doc.get("folderUid") or ""}
            st, res = api(args, "/api/dashboards/db", "POST", payload)
            msg = res.get("message", "") if isinstance(res, dict) else str(res)
            if st in (200, 201):
                created += 1
            elif "provisioned" in msg.lower():
                # Provisioning-managed dashboards are read-only via the API by
                # design — they're already restored from their provisioning
                # files, so skipping them is correct, not a failure.
                skipped += 1
            else:
                print(f"    ! dashboard '{model.get('title')}' HTTP {st}: {msg or res}")
                failed += 1
    tail = (f", {skipped} skipped (provisioned)" if skipped else "") + \
           (f", {failed} failed" if failed else "")
    print(f"  dashboards:   {created} restored{tail}")
    # A failed data source or folder is as fatal for automation as a failed
    # dashboard: the dashboards may import but their queries cannot resolve.
    total_failed = failed + ds_failed + fo_failed
    print("\nRestore complete." + (" Some items FAILED." if total_failed else ""))
    if total_failed:
        sys.exit(1)


# --------------------------------------------------------------------------- #
def die(msg):
    print(f"error: {msg}", file=sys.stderr)
    sys.exit(2)


def build_parser():
    p = argparse.ArgumentParser(description="Back up / restore Grafana dashboards, "
                                            "data sources and queries.")
    # required= on add_subparsers needs Python 3.7; enforce manually in main()
    # so the documented Python 3.6 baseline actually works.
    sub = p.add_subparsers(dest="cmd")

    def add_common(sp):
        sp.add_argument("--url", default=os.environ.get("GRAFANA_URL", "http://localhost:3101"),
                        help="Grafana base URL (env GRAFANA_URL)")
        sp.add_argument("--token", default=os.environ.get("GRAFANA_TOKEN"),
                        help="API / service-account token (env GRAFANA_TOKEN)")
        sp.add_argument("--user", default=os.environ.get("GRAFANA_USER"),
                        help="Basic-auth user (env GRAFANA_USER)")
        sp.add_argument("--password", default=os.environ.get("GRAFANA_PASSWORD"),
                        help="Basic-auth password (env GRAFANA_PASSWORD)")

    b = sub.add_parser("backup", help="export dashboards + data sources to JSON")
    add_common(b)
    b.add_argument("--out", default="./grafana-backup", help="output directory")

    r = sub.add_parser("restore", help="import a backup into a Grafana instance")
    add_common(r)
    r.add_argument("--in", dest="inp", default="./grafana-backup", help="backup directory")
    r.add_argument("--datasources", action="store_true",
                   help="also recreate data sources (secrets must be re-entered)")
    return p


def main():
    parser = build_parser()
    args = parser.parse_args()
    if args.cmd == "backup":
        backup(args)
    elif args.cmd == "restore":
        restore(args)
    else:
        parser.error("a command is required: backup or restore")


if __name__ == "__main__":
    main()
