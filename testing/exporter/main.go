package main

import (
	"math"
	"net/http"
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
}

var simLinks = []simLink{
	// Parallel core links.
	{link: "core-a<->core-b/1", device: "CORE-A", peer: "CORE-B", iface: "Eth-Trunk1", capacity: 10e9, txBase: 0.45, rxBase: 0.30},
	{link: "core-a<->core-b/2", device: "CORE-A", peer: "CORE-B", iface: "Eth-Trunk2", capacity: 10e9, txBase: 0.25, rxBase: 0.40},
	// Core to edge.
	{link: "core-a<->edge-1", device: "CORE-A", peer: "EDGE-1", iface: "HundredGigE0/0/1", capacity: 10e9, txBase: 0.35, rxBase: 0.25},
	{link: "core-b<->edge-2", device: "CORE-B", peer: "EDGE-2", iface: "HundredGigE0/0/2", capacity: 10e9, txBase: 0.30, rxBase: 0.35},
	// Edge to sites.
	{link: "edge-1<->site-atl", device: "EDGE-1", peer: "SITE-ATL", iface: "GigabitEthernet0/1", capacity: 1e9, txBase: 0.55, rxBase: 0.35, saturates: true},
	{link: "edge-1<->site-dfw", device: "EDGE-1", peer: "SITE-DFW", iface: "GigabitEthernet0/2", capacity: 1e9, txBase: 0.40, rxBase: 0.25, incident: true},
	{link: "edge-2<->site-nyc", device: "EDGE-2", peer: "SITE-NYC", iface: "GigabitEthernet0/3", capacity: 1e9, txBase: 0.50, rxBase: 0.45},
	// Internet uplink.
	{link: "core-b<->inet", device: "CORE-B", peer: "INET", iface: "HundredGigE0/0/9", capacity: 10e9, txBase: 0.20, rxBase: 0.60},
}

var simDevices = []string{"CORE-A", "CORE-B", "EDGE-1", "EDGE-2", "SITE-ATL", "SITE-DFW", "SITE-NYC", "INET"}

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
)

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

		if l.saturates && inWindow(now, satPeriod, satBurst) {
			tx = 0.97 * l.capacity
		}
		if l.incident && deviceDown {
			tx *= 0.02
			rx *= 0.02
		}

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

			i++
			time.Sleep(updateDelay)
		}
	}()

	http.Handle("/metrics", promhttp.Handler())
	log.Infof("Starting exporter: http://%s/metrics", address)
	log.Fatal(http.ListenAndServe(address, nil))
}
