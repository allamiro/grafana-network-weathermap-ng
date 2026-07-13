package main

import (
	_ "embed"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/aquilax/go-perlin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	log "github.com/sirupsen/logrus"
)

const address = ":8080"
const updateDelay = 2 * time.Second
const maxBandwidth = 1000000
const constantPercentage = 0.7

// A simulated WAN link. Traffic is a diurnal sine wave (compressed so a full
// "day" passes within a dashboard hour) plus Perlin noise, scaled to the
// link's capacity. Utilization is asymmetric per direction (txBase vs rxBase).
type simLink struct {
	link      string  // link id label, e.g. "core-a<->core-b/1"
	device    string  // A-side device
	peer      string  // Z-side device
	iface     string  // physical interface label
	capacity  float64 // bits per second
	txBase    float64 // baseline utilization 0..1 for A->Z
	rxBase    float64 // baseline utilization 0..1 for Z->A
	saturates bool    // periodically pushed to ~100% (capacity planning / red scale)
	incident  bool    // traffic collapses while the flapping device is down (incident replay)
	hardDown  bool    // link is operationally down: status 0, counters frozen (rate = 0)
}

var simLinks = []simLink{
	// Parallel core links.
	{link: "core-a<->core-b/1", device: "CORE-A", peer: "CORE-B", iface: "Eth-Trunk1", capacity: 10e9, txBase: 0.45, rxBase: 0.30},
	// Failed optics: operationally down, so its counters are frozen — like a
	// real interface, rate() is exactly 0 while wm_link_status reports 0.
	{link: "core-a<->core-b/2", device: "CORE-A", peer: "CORE-B", iface: "Eth-Trunk2", capacity: 10e9, txBase: 0.25, rxBase: 0.40, hardDown: true},
	// Core to edge.
	{link: "core-a<->edge-1", device: "CORE-A", peer: "EDGE-1", iface: "HundredGigE0/0/1", capacity: 10e9, txBase: 0.35, rxBase: 0.25},
	{link: "core-b<->edge-2", device: "CORE-B", peer: "EDGE-2", iface: "HundredGigE0/0/2", capacity: 10e9, txBase: 0.30, rxBase: 0.35},
	// Edge to sites.
	{link: "edge-1<->site-atl", device: "EDGE-1", peer: "SITE-ATL", iface: "GigabitEthernet0/1", capacity: 1e9, txBase: 0.55, rxBase: 0.35, saturates: true},
	{link: "edge-1<->site-dfw", device: "EDGE-1", peer: "SITE-DFW", iface: "GigabitEthernet0/2", capacity: 1e9, txBase: 0.40, rxBase: 0.25, incident: true},
	{link: "edge-2<->site-nyc", device: "EDGE-2", peer: "SITE-NYC", iface: "GigabitEthernet0/3", capacity: 1e9, txBase: 0.50, rxBase: 0.45},
	// Internet uplink.
	{link: "core-b<->inet", device: "CORE-B", peer: "INET", iface: "HundredGigE0/0/9", capacity: 10e9, txBase: 0.20, rxBase: 0.60},
	// LAG members between the aggregation pair (parallel-links demo).
	{link: "agg-a<->agg-b/1", device: "AGG-A", peer: "AGG-B", iface: "TenGigE0/0/1", capacity: 10e9, txBase: 0.50, rxBase: 0.35},
	{link: "agg-a<->agg-b/2", device: "AGG-A", peer: "AGG-B", iface: "TenGigE0/0/2", capacity: 10e9, txBase: 0.35, rxBase: 0.45},
	{link: "agg-a<->agg-b/3", device: "AGG-A", peer: "AGG-B", iface: "TenGigE0/0/3", capacity: 10e9, txBase: 0.15, rxBase: 0.20},
	// Long-haul between datacenters (multi-hop VIA demo).
	{link: "dc-west<->dc-east", device: "DC-WEST", peer: "DC-EAST", iface: "HundredGigE0/1/0", capacity: 100e9, txBase: 0.40, rxBase: 0.30},
	// Server-room links (floor-plan demo).
	{link: "fw<->sw", device: "FW-1", peer: "SW-CORE", iface: "Gi0/0", capacity: 10e9, txBase: 0.30, rxBase: 0.45},
	{link: "sw<->rack1", device: "SW-CORE", peer: "RACK1-TOR", iface: "Te1/0/1", capacity: 10e9, txBase: 0.40, rxBase: 0.25},
	{link: "sw<->rack2", device: "SW-CORE", peer: "RACK2-TOR", iface: "Te1/0/2", capacity: 10e9, txBase: 0.25, rxBase: 0.35},
	{link: "sw<->storage", device: "SW-CORE", peer: "STORAGE", iface: "Te1/0/3", capacity: 10e9, txBase: 0.55, rxBase: 0.60},
	// Global backbone (world-map demo): USA <-> Europe <-> Middle East.
	{link: "nyc<->lon", device: "NYC", peer: "LON", iface: "TAT-14", capacity: 100e9, txBase: 0.45, rxBase: 0.35},
	{link: "nyc<->fra", device: "NYC", peer: "FRA", iface: "AC-2", capacity: 100e9, txBase: 0.30, rxBase: 0.40},
	{link: "lon<->fra", device: "LON", peer: "FRA", iface: "PEB-1", capacity: 100e9, txBase: 0.25, rxBase: 0.25},
	{link: "lon<->dxb", device: "LON", peer: "DXB", iface: "EIG-1", capacity: 100e9, txBase: 0.50, rxBase: 0.30},
	{link: "fra<->dxb", device: "FRA", peer: "DXB", iface: "SMW-5", capacity: 100e9, txBase: 0.35, rxBase: 0.45},
	// In-rack cables (rack-cabling demo): router/firewall/switch trunks and
	// switch-to-server NIC runs inside one rack.
	{link: "rtr:1<->fw:1", device: "R-RTR", peer: "R-FW", iface: "Ge0/1", capacity: 10e9, txBase: 0.35, rxBase: 0.45},
	{link: "fw:2<->sw1:1", device: "R-FW", peer: "R-SW1", iface: "P2", capacity: 10e9, txBase: 0.35, rxBase: 0.40},
	{link: "sw1:8<->sw2:8", device: "R-SW1", peer: "R-SW2", iface: "Gi0/8", capacity: 10e9, txBase: 0.25, rxBase: 0.30},
	{link: "sw1:2<->srv1:eth0", device: "R-SW1", peer: "SRV-1", iface: "Gi0/2", capacity: 1e9, txBase: 0.40, rxBase: 0.55},
	{link: "sw1:3<->srv2:eth0", device: "R-SW1", peer: "SRV-2", iface: "Gi0/3", capacity: 1e9, txBase: 0.30, rxBase: 0.45},
	{link: "sw2:2<->srv3:eth0", device: "R-SW2", peer: "SRV-3", iface: "Gi0/2", capacity: 1e9, txBase: 0.55, rxBase: 0.65},
	{link: "sw2:3<->srv1:eth1", device: "R-SW2", peer: "SRV-1", iface: "Gi0/3", capacity: 1e9, txBase: 0.10, rxBase: 0.15},
}

var simDevices = []string{
	"CORE-A", "CORE-B", "EDGE-1", "EDGE-2", "SITE-ATL", "SITE-DFW", "SITE-NYC", "INET",
	"AGG-A", "AGG-B", "DC-WEST", "DC-EAST", "FW-1", "SW-CORE", "RACK1-TOR", "RACK2-TOR", "STORAGE",
	"NYC", "LON", "FRA", "DXB",
	"R-RTR", "R-FW", "R-SW1", "R-SW2", "SRV-1", "SRV-2", "SRV-3", "PDU-A", "PDU-B",
}

// SITE-DFW flaps: down for ~2 minutes out of every 10 (drives node status
// coloring and, via the incident flag above, the incident-replay dashboard).
const flapPeriod = 10 * time.Minute
const flapDown = 2 * time.Minute
const flappingDevice = "SITE-DFW"

// SITE-ATL saturation event: ~90 seconds of near-line-rate every 7 minutes.
const satPeriod = 7 * time.Minute
const satBurst = 90 * time.Second

var (
	// Original test series, kept for the legacy DEV dashboard.
	wmBandwidthVaried = promauto.NewGauge(prometheus.GaugeOpts{
		Name:        "wm_bandwidth_data",
		Help:        "Test data for the weathermap plugin.",
		ConstLabels: prometheus.Labels{"type": "varied"},
	})
	wmBandwidthConstant = promauto.NewGauge(prometheus.GaugeOpts{
		Name:        "wm_bandwidth_data",
		Help:        "Test data for the weathermap plugin.",
		ConstLabels: prometheus.Labels{"type": "constant"},
	})

	// Simulated WAN series.
	wmLinkBps = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_link_bps",
		Help: "Simulated link throughput in bits per second.",
	}, []string{"link", "device", "peer", "interface", "direction"})
	wmLinkErrors = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_link_errors",
		Help: "Simulated link input errors per second.",
	}, []string{"link"})
	wmLinkDiscards = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_link_discards",
		Help: "Simulated link discards per second.",
	}, []string{"link"})
	wmDeviceStatus = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_device_status",
		Help: "Simulated device status (1 = up, 0 = down).",
	}, []string{"device"})
	wmLatencyMs = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_latency_ms",
		Help: "Simulated device round-trip latency in milliseconds.",
	}, []string{"device"})
	wmPacketLossPct = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_packet_loss_pct",
		Help: "Simulated device packet loss percentage.",
	}, []string{"device"})
	wmLinkStatus = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_link_status",
		Help: "Simulated link operational status, like ifOperStatus (1 = up, 0 = down).",
	}, []string{"link"})
	wmPortStatus = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_port_status",
		Help: "Simulated switch port status (0 = down, 1 = up, 2 = admin-disabled).",
	}, []string{"device", "port"})
	wmPowerWatts = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_power_watts",
		Help: "Simulated server power draw in watts per feed (rack-cabling demo).",
	}, []string{"device", "feed"})
)

// Port map for the rack demo: RACK1-TOR's 24 access ports + 2 uplinks.
// Ports 7 and 19 are hard down (unpatched), port 13 flaps on a 5-minute
// cycle, ports 23/24 are admin-disabled, everything else is up.
const rackDevice = "RACK1-TOR"
const portFlapPeriod = 5 * time.Minute
const portFlapDown = 90 * time.Second

func simulatePorts(now time.Time) {
	portFlapping := inWindow(now, portFlapPeriod, portFlapDown)
	for p := 1; p <= 24; p++ {
		port := "Gi1/0/" + strconv.Itoa(p)
		status := 1.0
		switch {
		case p == 7 || p == 19:
			status = 0
		case p == 13 && portFlapping:
			status = 0
		case p == 23 || p == 24:
			status = 2
		}
		wmPortStatus.WithLabelValues(rackDevice, port).Set(status)
	}
	// 10G uplinks to the core switch.
	wmPortStatus.WithLabelValues(rackDevice, "Te1/1/1").Set(1)
	wmPortStatus.WithLabelValues(rackDevice, "Te1/1/2").Set(1)

	// Multi-device rack (rack-cabling demo): SW1 port 5 is hard down, SRV-2's
	// standby NIC is down, SRV-3's iLO is unreachable, PDU outlet 6 is off.
	for p := 1; p <= 8; p++ {
		s1 := 1.0
		if p == 5 {
			s1 = 0
		}
		wmPortStatus.WithLabelValues("R-SW1", "Gi0/"+strconv.Itoa(p)).Set(s1)
		wmPortStatus.WithLabelValues("R-SW2", "Gi0/"+strconv.Itoa(p)).Set(1)
	}
	for p := 1; p <= 4; p++ {
		wmPortStatus.WithLabelValues("R-RTR", "Ge0/"+strconv.Itoa(p)).Set(1)
		wmPortStatus.WithLabelValues("R-FW", "P"+strconv.Itoa(p)).Set(1)
	}
	for _, srv := range []string{"SRV-1", "SRV-2", "SRV-3"} {
		wmPortStatus.WithLabelValues(srv, "eth0").Set(1)
		eth1 := 1.0
		if srv == "SRV-2" {
			eth1 = 0
		}
		wmPortStatus.WithLabelValues(srv, "eth1").Set(eth1)
		ilo := 1.0
		if srv == "SRV-3" {
			ilo = 0
		}
		wmPortStatus.WithLabelValues(srv, "ilo").Set(ilo)
		// Dual power feeds: psu-a on PDU-A, psu-b on PDU-B. SRV-3's A feed is
		// plugged into PDU-A's dead outlet 6, so its full draw shifts to the B
		// feed — the redundancy story on the rack-cabling dashboard.
		total := 280 + 140*math.Abs(math.Sin(float64(now.UnixMilli())/900000+float64(len(srv))))
		psuA, psuB := 1.0, 1.0
		wattsA, wattsB := total*0.55, total*0.45
		if srv == "SRV-3" {
			psuA = 0
			wattsA = 0
			wattsB = total
		}
		// SRV-2 has a single supply (diversity in the demo rack); the others
		// are dual-fed from PDU-A and PDU-B.
		if srv == "SRV-2" {
			wattsA = total
		}
		wmPortStatus.WithLabelValues(srv, "psu-a").Set(psuA)
		wmPowerWatts.WithLabelValues(srv, "a").Set(wattsA)
		if srv != "SRV-2" {
			wmPortStatus.WithLabelValues(srv, "psu-b").Set(psuB)
			wmPowerWatts.WithLabelValues(srv, "b").Set(wattsB)
		}
	}
	for o := 1; o <= 8; o++ {
		v := 1.0
		if o == 6 {
			v = 0
		}
		wmPortStatus.WithLabelValues("PDU-A", "outlet"+strconv.Itoa(o)).Set(v)
		wmPortStatus.WithLabelValues("PDU-B", "outlet"+strconv.Itoa(o)).Set(1)
	}
}

// diurnal maps wall-clock time onto a compressed "day" so a full peak/trough
// cycle is visible within a dashboard hour: value in [0.6, 1.4].
func diurnal(t time.Time) float64 {
	const dayPeriod = 40 * time.Minute
	phase := float64(t.UnixMilli()%dayPeriod.Milliseconds()) / float64(dayPeriod.Milliseconds())
	return 1 + 0.4*math.Sin(2*math.Pi*phase)
}

func inWindow(t time.Time, period, width time.Duration) bool {
	return t.UnixMilli()%period.Milliseconds() < width.Milliseconds()
}

func simulate(p *perlin.Perlin, step int, now time.Time) {
	day := diurnal(now)
	deviceDown := inWindow(now, flapPeriod, flapDown)

	for li, l := range simLinks {
		// Independent noise streams per link/direction, roughly [0.75, 1.25].
		noiseTx := 1 + 0.5*p.Noise2D(float64(step)/80, float64(li))
		noiseRx := 1 + 0.5*p.Noise2D(float64(step)/80, float64(li)+100)

		tx := l.txBase * day * noiseTx * l.capacity
		rx := l.rxBase * day * noiseRx * l.capacity

		// Staggered micro-bursts (~45s every 13 min, offset per link) so the
		// map keeps changing like a real enterprise network.
		if inWindow(now.Add(-time.Duration(li)*97*time.Second), 13*time.Minute, 45*time.Second) {
			tx *= 1.6
			rx *= 1.4
		}

		if l.saturates && inWindow(now, satPeriod, satBurst) {
			tx = 0.97 * l.capacity
		}

		// Real-world semantics: a down interface stops counting, so its rate
		// is exactly zero — the historical graph shows the collapse and then
		// flatlines, exactly what SNMP ifOperStatus + counters would produce.
		// This covers both permanently-down links and links whose device is
		// down during an incident window.
		linkUp := 1.0
		if l.hardDown || (l.incident && deviceDown) {
			linkUp = 0
			tx = 0
			rx = 0
		}
		wmLinkStatus.WithLabelValues(l.link).Set(linkUp)

		wmLinkBps.WithLabelValues(l.link, l.device, l.peer, l.iface, "tx").Set(math.Min(tx, l.capacity))
		wmLinkBps.WithLabelValues(l.link, l.device, l.peer, l.iface, "rx").Set(math.Min(rx, l.capacity))

		// Errors/discards stay near zero except when a link runs hot.
		util := math.Max(tx, rx) / l.capacity
		errRate := math.Max(0, (util-0.85)*200) * math.Abs(p.Noise1D(float64(step)/30+float64(li)))
		wmLinkErrors.WithLabelValues(l.link).Set(errRate)
		wmLinkDiscards.WithLabelValues(l.link).Set(errRate * 2.5)
	}

	for di, d := range simDevices {
		status := 1.0
		latency := 8 + 20*math.Abs(p.Noise1D(float64(step)/60+float64(di)*10))
		loss := 0.5 * math.Abs(p.Noise1D(float64(step)/45+float64(di)*20))

		if d == flappingDevice && deviceDown {
			status = 0
			latency = 0
			loss = 100
		}

		wmDeviceStatus.WithLabelValues(d).Set(status)
		wmLatencyMs.WithLabelValues(d).Set(latency)
		wmPacketLossPct.WithLabelValues(d).Set(loss)
	}
}

func main() {
	log.Info("Starting weathermap testing data exporter")

	p := perlin.NewPerlin(2, 1, 3, 0)

	go func() {
		i := 0
		for {
			now := time.Now()

			// Legacy series for the DEV migration-fixture dashboard.
			val := (p.Noise1D(float64(i)/100) + 0.5) * maxBandwidth
			wmBandwidthVaried.Set(val)
			wmBandwidthConstant.Set(constantPercentage * maxBandwidth)

			simulate(p, i, now)
			simulatePorts(now)
			simulateBGP(i, now)
			simulateRail(now)

			i++
			time.Sleep(updateDelay)
		}
	}()

	http.Handle("/metrics", promhttp.Handler())
	http.HandleFunc("/floorplan.svg", serveFloorplan)
	http.HandleFunc("/worldmap.svg", serveWorldmap)
	http.HandleFunc("/rack.svg", serveRack)
	http.HandleFunc("/rack2.svg", serveRack2)
	log.Infof("Starting exporter: http://%s/metrics", address)
	log.Fatal(http.ListenAndServe(address, nil))
}

// worldmapSVG is "BlankMap-World-Equirectangular.svg" from Wikimedia Commons
// (public domain), recolored for dark dashboards and wrapped in a 900x620
// canvas so node positions in the global-backbone demo map 1:1 to pixels.
//
//go:embed assets/worldmap.svg
var worldmapSVG []byte

func serveWorldmap(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "max-age=3600")
	_, _ = w.Write(worldmapSVG)
}

// serveRack returns a rack/switch faceplate diagram used as the background by
// the rack port-status demo dashboard: a 1U 24-port switch drawn inside a rack
// outline. The port squares themselves are weathermap nodes colored by status.
func serveRack(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "max-age=3600")
	_, _ = w.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 620">
  <rect width="900" height="620" fill="#14161c"/>
  <!-- rack frame -->
  <rect x="120" y="40" width="660" height="540" rx="10" fill="#1b1e26" stroke="#4a5162" stroke-width="4"/>
  <line x1="150" y1="40" x2="150" y2="580" stroke="#2e3340" stroke-width="2"/>
  <line x1="750" y1="40" x2="750" y2="580" stroke="#2e3340" stroke-width="2"/>
  <!-- rail holes -->
  <g fill="#2e3340">` + rackHoles() + `</g>
  <!-- 1U switch: RACK1-TOR -->
  <rect x="160" y="150" width="580" height="150" rx="6" fill="#232a38" stroke="#39445a" stroke-width="3"/>
  <text x="175" y="180" fill="#6b7280" font-family="sans-serif" font-size="20">RACK1-TOR — 24x 1GbE + 2x 10GbE uplinks</text>
  <!-- patch panel + blank units -->
  <rect x="160" y="330" width="580" height="60" rx="6" fill="#1f2430" stroke="#2e3340" stroke-width="2"/>
  <text x="175" y="367" fill="#4a5162" font-family="sans-serif" font-size="16">patch panel</text>
  <rect x="160" y="420" width="580" height="60" rx="6" fill="#1f2430" stroke="#2e3340" stroke-width="2"/>
  <rect x="160" y="60" width="580" height="60" rx="6" fill="#1f2430" stroke="#2e3340" stroke-width="2"/>
  <text x="175" y="97" fill="#4a5162" font-family="sans-serif" font-size="16">cable management</text>
</svg>`))
}

func rackHoles() string {
	out := ""
	for y := 60; y <= 560; y += 25 {
		out += `<circle cx="135" cy="` + itoa(y) + `" r="4"/><circle cx="765" cy="` + itoa(y) + `" r="4"/>`
	}
	return out
}

// serveRack2 returns the rear elevation of a multi-device rack (router,
// firewall, two access switches, patch panel, three servers) plus a vertical
// PDU strip. Used as the background of the rack-cabling demo dashboard; the
// port/NIC/PSU/outlet squares are weathermap nodes and the cables are links
// routed through the left (network) and right (power) cable channels.
func serveRack2(w http.ResponseWriter, r *http.Request) {
	unit := func(y, h int, label string, labelX int) string {
		anchor := ""
		if labelX > 450 {
			anchor = ` text-anchor="end"`
		}
		return `<rect x="220" y="` + itoa(y) + `" width="450" height="` + itoa(h) + `" rx="5" fill="#232a38" stroke="#39445a" stroke-width="2"/>` +
			`<text x="` + itoa(labelX) + `" y="` + itoa(y+22) + `"` + anchor + ` fill="#c7cdd9" font-family="sans-serif" font-size="14" font-weight="600">` + label + `</text>`
	}
	holes := ""
	for y := 55; y <= 725; y += 22 {
		holes += `<circle cx="130" cy="` + itoa(y) + `" r="3"/><circle cx="690" cy="` + itoa(y) + `" r="3"/>`
	}

	// Port openings under every status node position (see buildRackCabling in
	// testing/scripts/generate-scenario-dashboards.js).
	frames := ""
	for p := 1; p <= 4; p++ {
		frames += fpPortFrame(350+p*50, 128) + fpPortFrame(350+p*50, 196)
	}
	for p := 1; p <= 8; p++ {
		frames += fpPortFrame(250+45*p, 264) + fpPortFrame(250+45*p, 332)
	}
	serverArt := ""
	for i, y := range []int{412, 480, 548} {
		cy := y + 38
		serverArt += fpVGA(255, cy) + fpVent(285, y+22, 130, 28) +
			fpPortFrame(450, cy) + fpPortFrame(505, cy) + fpPortFrame(555, cy)
		if i == 1 {
			// SRV-2: single power supply.
			serverArt += `<rect x="605" y="` + itoa(y+8) + `" width="60" height="46" rx="3" fill="#1b2027" stroke="#4a5162" stroke-width="1.5"/>` +
				fpFan(620, y+18, 8) + fpPortFrame(648, cy)
		} else {
			serverArt += `<rect x="585" y="` + itoa(y+8) + `" width="80" height="46" rx="3" fill="#1b2027" stroke="#4a5162" stroke-width="1.5"/>` +
				fpFan(602, y+18, 8) + fpFan(650, y+18, 8) +
				fpPortFrame(610, cy) + fpPortFrame(648, cy)
		}
	}
	patch := ""
	for j := 0; j < 12; j++ {
		patch += fpRJ45(300+j*30, 383)
	}
	pdu := func(x int, label string) string {
		out := `<rect x="` + itoa(x) + `" y="60" width="55" height="640" rx="6" fill="#1f2430" stroke="#39445a" stroke-width="3"/>` +
			`<text x="` + itoa(x+6) + `" y="86" fill="#c7cdd9" font-family="sans-serif" font-size="12" font-weight="600">` + label + `</text>`
		for o := 1; o <= 8; o++ {
			y := 120 + 78*(o-1)
			out += fpC13(x+27, y) + `<text x="` + itoa(x-12) + `" y="` + itoa(y+4) + `" fill="#4a5162" font-family="sans-serif" font-size="10">` + itoa(o) + `</text>`
		}
		return out
	}

	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "max-age=3600")
	_, _ = w.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 760">
  <rect width="1000" height="760" fill="#14161c"/>
  <text x="110" y="28" fill="#c7cdd9" font-family="sans-serif" font-size="17" font-weight="600">RACK B-02 — rear elevation</text>
  <!-- rack frame -->
  <rect x="110" y="40" width="600" height="700" rx="8" fill="#1b1e26" stroke="#4a5162" stroke-width="4"/>
  <g fill="#2e3340">` + holes + `</g>
  <!-- left network cable channel (routing gutter) -->
  <rect x="145" y="48" width="72" height="684" rx="4" fill="#181c24" stroke="#252b36" stroke-width="1"/>
  <text x="158" y="66" fill="#4a5568" font-family="sans-serif" font-size="10">NET</text>
  <!-- device faceplates -->
  ` + unit(90, 60, "R-RTR", 232) + fpVent(295, 104, 80, 36) + fpSFP(630, 120) + fpSFP(630, 136) +
		unit(158, 60, "R-FW", 232) + fpVent(295, 172, 80, 36) + fpFan(635, 196, 15) +
		unit(226, 60, "R-SW1", 232) + fpGroupTab(280, 460, 284) + fpGroupTab(470, 640, 284) + fpSFP(650, 240) +
		unit(294, 60, "R-SW2", 232) + fpGroupTab(280, 460, 352) + fpGroupTab(470, 640, 352) + fpSFP(650, 308) + `
  <rect x="220" y="362" width="450" height="42" rx="5" fill="#1f2430" stroke="#2e3340" stroke-width="2"/>
  <text x="232" y="388" fill="#4a5162" font-family="sans-serif" font-size="13">patch</text>
  ` + patch +
		unit(412, 60, "SRV-1", 232) + unit(480, 60, "SRV-2", 232) + unit(548, 60, "SRV-3", 232) + serverArt + `
  <rect x="220" y="616" width="450" height="112" rx="5" fill="#1f2430" stroke="#2e3340" stroke-width="2"/>
  <text x="232" y="644" fill="#4a5162" font-family="sans-serif" font-size="13">blanking panels</text>
  ` + fpVent(320, 650, 300, 50) + `
  <!-- PDU strips: A (primary) and B (redundant) feeds -->
  <text x="730" y="52" fill="#8a93a5" font-family="sans-serif" font-size="11">Power feeds</text>
  ` + pdu(730, "PDU-A") + pdu(815, "PDU-B") + frames + `
  <!-- legend -->
  <g font-family="sans-serif" font-size="11">
    <rect x="730" y="712" width="245" height="42" rx="4" fill="#181c24" stroke="#2e3340"/>
    <rect x="740" y="720" width="10" height="10" rx="2" fill="#73BF69"/><text x="754" y="729" fill="#8a93a5">up</text>
    <rect x="782" y="720" width="10" height="10" rx="2" fill="#F2495C"/><text x="796" y="729" fill="#8a93a5">down/off</text>
    <rect x="856" y="720" width="10" height="10" rx="2" fill="#55575c"/><text x="870" y="729" fill="#8a93a5">disabled</text>
    <text x="740" y="746" fill="#8a93a5">thick = data (load color) · thin = power (W)</text>
  </g>
</svg>`))
}

// serveFloorplan returns a simple server-room floor plan used as the map
// background by the floor-plan demo dashboard (port 8080 is published by the
// docker-compose so the browser can load it).
func serveFloorplan(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "image/svg+xml")
	w.Header().Set("Cache-Control", "max-age=3600")
	_, _ = w.Write([]byte(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 620">
  <rect width="900" height="620" fill="#14161c"/>
  <g stroke="#2e3340" stroke-width="1">` +
		gridLines() + `
  </g>
  <g fill="none" stroke="#4a5162" stroke-width="3">
    <rect x="40" y="40" width="820" height="540" rx="8"/>
    <rect x="70" y="70" width="220" height="180" rx="4"/>
    <rect x="70" y="330" width="220" height="220" rx="4"/>
    <rect x="360" y="70" width="480" height="200" rx="4"/>
    <rect x="360" y="330" width="220" height="220" rx="4"/>
    <rect x="620" y="330" width="220" height="220" rx="4"/>
  </g>
  <g fill="#6b7280" font-family="sans-serif" font-size="18">
    <text x="80" y="95">MDF / Entrance</text>
    <text x="80" y="355">UPS &amp; Power</text>
    <text x="370" y="95">Server Room</text>
    <text x="370" y="355">Rack Row 1</text>
    <text x="630" y="355">Rack Row 2</text>
  </g>
</svg>`))
}

func gridLines() string {
	out := ""
	for x := 0; x <= 900; x += 60 {
		out += `<line x1="` + itoa(x) + `" y1="0" x2="` + itoa(x) + `" y2="620"/>`
	}
	for y := 0; y <= 620; y += 60 {
		out += `<line x1="0" y1="` + itoa(y) + `" x2="900" y2="` + itoa(y) + `"/>`
	}
	return out
}

func itoa(n int) string {
	return strconv.Itoa(n)
}
