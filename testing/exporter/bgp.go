package main

import (
	"math"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Simulated BGP neighbor telemetry for the "BGP Neighbor Map" demo (#294).
//
// These series are emitted with vendor-neutral names on purpose: in production
// you normalize each platform's raw metric (Cisco cbgpPeer2State, Juniper
// jnxBgpM2PeerState, standard bgpPeerState, or gNMI session-state) into exactly
// this shape with a Prometheus recording rule, so the same dashboards work
// across a mixed Cisco/Juniper/F5/gNMI fleet. The `vendor` label here only
// exists so the demo can show that heterogeneity on one map.
//
// Label set is shared by every bgp_* metric so they join cleanly:
//   node_name    local router
//   peer         neighbor short name (also used as the map's Z node)
//   peer_ip      neighbor address
//   peer_as      neighbor ASN
//   afi          address family (ipv4 / ipv6)
//   session_type ebgp / ibgp
//   vendor       cisco / juniper / f5   (illustrative only)
var bgpLabels = []string{"node_name", "peer", "peer_ip", "peer_as", "afi", "session_type", "vendor"}

// BGP FSM states, matching the SNMP bgpPeerState / cbgpPeer2State enum so the
// demo's raw-state series behaves exactly like real gear.
const (
	bgpIdle        = 1.0
	bgpConnect     = 2.0
	bgpActive      = 3.0
	bgpEstablished = 6.0
)

type simBGP struct {
	local     string  // local router (A-side node)
	peer      string  // neighbor short name (Z-side node)
	peerIP    string
	localAS   string
	peerAS    string
	afi       string // ipv4 | ipv6
	typ       string // ebgp | ibgp
	vendor    string // cisco | juniper | f5
	rxPfx     float64 // prefixes received from the peer (steady-state)
	txPfx     float64 // prefixes advertised to the peer
	limit     float64 // max-prefix limit (0 = none)
	flaps     bool    // session drops periodically (down demo: ✕ + blink)
	hardDown  bool    // session is permanently down (always-visible dropped peer)
}

// A small but realistic dual-stack network: local AS 65001 with two Cisco route
// reflectors (CORE1/CORE2), two Juniper border routers (EDGE1/EDGE2), and an F5
// injecting VIP routes over iBGP. eBGP to two upstream transits and one IX peer,
// in both IPv4 and IPv6. One transit session flaps; one sits near its prefix
// limit.
var simBGPSessions = []simBGP{
	// iBGP core / route reflection (AS65001)
	{local: "CORE1", peer: "CORE2", peerIP: "10.0.0.2", localAS: "65001", peerAS: "65001", afi: "ipv4", typ: "ibgp", vendor: "cisco", rxPfx: 2100, txPfx: 2100},
	{local: "CORE1", peer: "EDGE1", peerIP: "10.0.0.11", localAS: "65001", peerAS: "65001", afi: "ipv4", typ: "ibgp", vendor: "cisco", rxPfx: 960000, txPfx: 2100},
	{local: "CORE2", peer: "EDGE2", peerIP: "10.0.0.12", localAS: "65001", peerAS: "65001", afi: "ipv4", typ: "ibgp", vendor: "cisco", rxPfx: 951000, txPfx: 2100},
	{local: "CORE1", peer: "LB1", peerIP: "10.0.0.20", localAS: "65001", peerAS: "65001", afi: "ipv4", typ: "ibgp", vendor: "f5", rxPfx: 12, txPfx: 2100},
	// eBGP borders (IPv4)
	{local: "EDGE1", peer: "TRANSIT-A", peerIP: "203.0.113.1", localAS: "65001", peerAS: "64500", afi: "ipv4", typ: "ebgp", vendor: "juniper", rxPfx: 958000, txPfx: 2050, limit: 1100000},
	{local: "EDGE2", peer: "TRANSIT-B", peerIP: "198.51.100.1", localAS: "65001", peerAS: "64501", afi: "ipv4", typ: "ebgp", vendor: "juniper", rxPfx: 951000, txPfx: 2050, limit: 1100000, flaps: true},
	{local: "EDGE1", peer: "PEER-X", peerIP: "203.0.113.9", localAS: "65001", peerAS: "64502", afi: "ipv4", typ: "ebgp", vendor: "juniper", rxPfx: 5200, txPfx: 2050, limit: 20000},
	// Permanently-down eBGP peer so the "neighbor down" treatment (✕ badges +
	// DOWN labels + blink) is always visible on the map, like the WAN demo's
	// hard-down trunk.
	{local: "EDGE2", peer: "PEER-Y", peerIP: "198.51.100.9", localAS: "65001", peerAS: "64503", afi: "ipv4", typ: "ebgp", vendor: "juniper", rxPfx: 0, txPfx: 0, limit: 20000, hardDown: true},
	// eBGP borders (IPv6, parallel links)
	{local: "EDGE1", peer: "TRANSIT-A", peerIP: "2001:db8:113::1", localAS: "65001", peerAS: "64500", afi: "ipv6", typ: "ebgp", vendor: "juniper", rxPfx: 195000, txPfx: 400, limit: 300000},
	{local: "EDGE2", peer: "TRANSIT-B", peerIP: "2001:db8:64::1", localAS: "65001", peerAS: "64501", afi: "ipv6", typ: "ebgp", vendor: "juniper", rxPfx: 193000, txPfx: 400, limit: 300000, flaps: true},
}

// One transit session flaps: down ~90s out of every 8 minutes, so the map shows
// a dropped neighbor (✕ + blink + DOWN) most of the time it's watched.
const bgpFlapPeriod = 8 * time.Minute
const bgpFlapDown = 90 * time.Second

var (
	bgpSessionUp = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "bgp_session_up",
		Help: "Normalized BGP session state (1 = Established, 0 = down). In production this is a recording rule over the vendor's session-state metric.",
	}, bgpLabels)
	bgpSessionState = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "bgp_session_state",
		Help: "Raw BGP FSM state like SNMP bgpPeerState (idle=1 connect=2 active=3 opensent=4 openconfirm=5 established=6).",
	}, bgpLabels)
	bgpPrefixesReceived = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "bgp_prefixes_received",
		Help: "Prefixes received (accepted) from the neighbor.",
	}, bgpLabels)
	bgpPrefixesAdvertised = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "bgp_prefixes_advertised",
		Help: "Prefixes advertised to the neighbor.",
	}, bgpLabels)
	bgpPrefixLimit = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "bgp_prefix_limit",
		Help: "Configured max-prefix limit for the neighbor (0 = unset).",
	}, bgpLabels)
	bgpSessionUptime = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "bgp_session_uptime_seconds",
		Help: "Seconds since the session last reached Established (0 while down).",
	}, bgpLabels)
	bgpPeerFlaps = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "bgp_peer_flaps_total",
		Help: "Cumulative session flaps observed for the neighbor.",
	}, bgpLabels)
)

var bgpBoot time.Time

func simulateBGP(step int, now time.Time) {
	if bgpBoot.IsZero() {
		bgpBoot = now
	}
	flapNow := inWindow(now, bgpFlapPeriod, bgpFlapDown)
	// Position (ms) inside the current flap period, for uptime/flap counts.
	posMs := now.UnixMilli() % bgpFlapPeriod.Milliseconds()
	// Flaps counted since the exporter booted, so it reads like a real,
	// slowly-growing counter rather than periods-since-1970.
	flapsSoFar := float64((now.UnixMilli() - bgpBoot.UnixMilli()) / bgpFlapPeriod.Milliseconds())

	for si, s := range simBGPSessions {
		lv := []string{s.local, s.peer, s.peerIP, s.peerAS, s.afi, s.typ, s.vendor}

		down := (s.flaps && flapNow) || s.hardDown
		state := bgpEstablished
		up := 1.0
		uptime := now.Unix() - bgpBoot.Unix() // stable sessions: since exporter start
		flaps := 0.0

		if s.hardDown {
			// A peer that never comes up: stuck in Idle/Active, no routes.
			state = bgpIdle
			up = 0
			uptime = 0
		} else if s.flaps {
			flaps = flapsSoFar
			if down {
				// Cycle through the pre-Established FSM states while down.
				switch (posMs / 30000) % 3 {
				case 0:
					state = bgpActive
				case 1:
					state = bgpConnect
				default:
					state = bgpIdle
				}
				up = 0
				uptime = 0
			} else {
				// Uptime resets after each flap: seconds since the down window ended.
				uptime = (posMs - bgpFlapDown.Milliseconds()) / 1000
				if uptime < 0 {
					uptime = 0
				}
			}
		}

		bgpSessionUp.WithLabelValues(lv...).Set(up)
		bgpSessionState.WithLabelValues(lv...).Set(state)
		bgpPrefixLimit.WithLabelValues(lv...).Set(s.limit)
		bgpSessionUptime.WithLabelValues(lv...).Set(float64(uptime))
		bgpPeerFlaps.WithLabelValues(lv...).Set(flaps)

		if up == 0 {
			// A dropped session withdraws its routes.
			bgpPrefixesReceived.WithLabelValues(lv...).Set(0)
			bgpPrefixesAdvertised.WithLabelValues(lv...).Set(0)
			continue
		}

		// Slow drift so the prefix counts look alive (full tables wobble by a
		// few hundred routes as the DFZ churns).
		wobble := 1 + 0.002*math.Sin(2*math.Pi*float64(step)/180+float64(si))
		bgpPrefixesReceived.WithLabelValues(lv...).Set(math.Round(s.rxPfx * wobble))
		bgpPrefixesAdvertised.WithLabelValues(lv...).Set(s.txPfx)
	}
}
