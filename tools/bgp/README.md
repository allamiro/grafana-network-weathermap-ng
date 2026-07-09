# BGP neighbor visualization — starter kit

Visualize **BGP neighbor status** on Network Weathermap NG: routers are nodes,
BGP sessions are links, **session state is the link status** (dashed + ✕ + DOWN
+ blink when a peer drops), prefix counts are the labels, and max-prefix
fullness is the color. This kit gives you everything to point it at real Cisco /
Juniper / F5 / gNMI gear.

![BGP neighbor map](../../website/docs/img/use-cases/wm-bgp-map.png)

## What's in here

| File | What it is |
|---|---|
| `bgp-recording-rules.yml` | Prometheus rules that normalize each vendor's raw BGP metric into the vendor-neutral series the dashboards bind to (`bgp_session_up`, `bgp_prefixes_received`, …). |
| `snmp_generator_bgp.yml` | snmp_exporter **generator** modules for Cisco (`cbgpPeer2`), Juniper (`jnxBgpM2`), and the standard BGP4-MIB (F5 / generic). |
| `bgp-fleet-overview.json` | Importable dashboard — session status table + prefixes bar gauge. **Topology-agnostic: works for any fleet as-is.** |
| `bgp-session-detail.json` | Importable per-router drill-down (state / prefixes / uptime / flaps). **Works for any fleet as-is.** |
| `bgp-neighbor-map.example.json` | The weathermap map. A map is topology-specific — import this as a **worked example** and rebuild the nodes/links for your routers. |

## The one rule that makes it work

The map treats a **Status Query** as `0`/absent = down, non-zero = up. Vendor
state metrics are **enums** (`idle=1 … established=6`), so a session in `active`
(3) reads as "up" if fed raw. The recording rules collapse state to a correct
1/0 with `== bool 6`:

```promql
bgp_session_up = (cbgpPeer2State == bool 6)   # Cisco; same idea per vendor
```

Bind `bgp_session_up` as the link **Status Query**, `bgp_prefixes_advertised` /
`bgp_prefixes_received` as the A/Z **values**, and set the side **Bandwidth** to
the max-prefix limit so the color warms as a peer fills its table.

## Choosing how to collect BGP

What you can collect depends on **where in the router's BGP pipeline you tap** —
Adj-RIB-In (what a peer sent, pre/post inbound policy), Loc-RIB (best paths), or
Adj-RIB-Out (what you advertise). **A neighbor-status map only needs session
health + prefix counts**, so pick a health-oriented tap:

| Intent | Method | Fits this map? |
|---|---|---|
| Session health + prefix counts, dashboards | **gNMI / OpenConfig** streaming (push, structured, multi-AFI) | **Best** |
| Same, if you already run SNMP everywhere | **SNMP BGP4-MIB / vendor MIB** (pull) | **Yes, simplest** |
| Full route-table contents, pre-policy Adj-RIB-In | BMP (RFC 7854) → collector → Kafka | Overkill — different pipeline |
| Live update feed / classic route collector | Peer a passive speaker (ExaBGP/GoBGP/BIRD) | Overkill |
| Quick snapshot / can't reconfigure the router | CLI scrape (NAPALM `get_bgp_neighbors`) | Works, but brittle/periodic |
| Offline archive/analysis | MRT dumps (RFC 6396) | Not for live dashboards |

So: **gNMI** if your gear supports it, **SNMP** otherwise. BMP/peering/MRT are
for route-*contents* analytics, not a status map.

> **Reachability:** SNMP is pull (exporter → device UDP/161); gNMI and BMP are
> device → collector over TCP. Across a firewalled enclave those flows must be
> permitted; in a truly air-gapped enclave you're limited to CLI snapshots or
> shipping dumps out-of-band.

## Per-vendor sources

| Platform | SNMP (via snmp_exporter) | gNMI / OpenConfig path |
|---|---|---|
| **Cisco** (IOS-XE/XR/NX-OS) | `CISCO-BGP4-MIB` `cbgpPeer2State`, `cbgpPeer2Accepted/AdvertisedPrefixes` (IPv4+IPv6) | `…/bgp/neighbors/neighbor/state/session-state`, `…/afi-safis/afi-safi/state/prefixes/received` |
| **Juniper** (Junos) | `BGP4-V2-MIB-JUNIPER` `jnxBgpM2PeerState`, `jnxBgpM2PrefixInPrefixesAccepted` | same OpenConfig paths |
| **F5 BIG-IP** | standard `BGP4-MIB` `bgpPeerState` (advanced routing / ZebOS, IPv4) | — |
| **Any (gNMI)** | — | collect with `gnmic` → Prometheus output |

The standard `BGP4-MIB` is IPv4-unicast only; IPv6/other AFI-SAFI needs the
vendor MIB or gNMI.

## Wire it up

1. **Collect.** For SNMP: add the matching module from `snmp_generator_bgp.yml`
   to your snmp_exporter generator, `make generate`, and scrape each device with
   the right module. Attach a `node_name` label to each target in the Prometheus
   scrape config (relabel), so the dashboards can key on the router. For gNMI:
   run `gnmic` with a Prometheus output subscribed to the BGP neighbor paths.
2. **Normalize.** Add `bgp-recording-rules.yml` to Prometheus `rule_files:` and
   reload. You now have `bgp_session_up`, `bgp_prefixes_received`, etc.
3. **Import.** Load `bgp-fleet-overview.json` and `bgp-session-detail.json` — they
   work immediately. Import `bgp-neighbor-map.example.json` and rebuild its nodes
   and links to your topology (same binding pattern: Status Query =
   `bgp_session_up{...}`, values = `bgp_prefixes_*{...}`, bandwidth = the
   max-prefix limit).

See the full walkthrough with screenshots in the
[BGP Neighbor Status guide](https://allamiro.github.io/grafana-network-weathermap-ng/guide/bgp/).
