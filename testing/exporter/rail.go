package main

// Rail Operations demo telemetry (#300). ALL VALUES ARE SIMULATED — this is
// deterministic, timestamp-driven demo data mimicking what a read-only
// SCADA/PLC gateway would export. It controls nothing.
//
// Demo topology (two physical tracks, one per direction):
//
//	Yard — Station A — Station B — [crossover] — Junction — Station C — Depot
//	                                              \_ depot branch (t3)
//
// Track 1 (eastbound):  t1-b01 .. t1-b05
// Track 2 (westbound):  t2-b01 .. t2-b05
// Branch:               t3-b01 (Junction -> Depot, bidirectional)
//
// Numeric conventions (documented in the plugin docs):
//	wm_rail_track_occupied:  1 = occupied, 0 = clear
//	wm_rail_track_state:     1 = available, 0 = blocked/out of service
//	wm_rail_signal_state:    0 = stop, 1 = caution, 2 = clear
//	wm_rail_signal_health:   1 = healthy, 0 = failed
//	wm_rail_switch_position: 0 = normal, 1 = reverse, 2 = moving
//	wm_rail_switch_detected: 1 = detected, 0 = detection lost
//	wm_rail_switch_locked:   1 = locked, 0 = free
//	wm_rail_train_progress{train_id,segment_id}: 0..1 along the segment;
//	  exactly one series per train, relabelled as the train advances.
import (
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	railTrackOccupied = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_track_occupied",
		Help: "SIMULATED block occupancy (1 = occupied, 0 = clear).",
	}, []string{"segment_id", "track"})
	railTrackState = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_track_state",
		Help: "SIMULATED block availability (1 = available, 0 = blocked).",
	}, []string{"segment_id", "track"})
	railSignalState = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_signal_state",
		Help: "SIMULATED signal aspect (0 = stop, 1 = caution, 2 = clear).",
	}, []string{"signal_id"})
	railSignalHealth = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_signal_health",
		Help: "SIMULATED signal machine health (1 = healthy, 0 = failed).",
	}, []string{"signal_id"})
	railSwitchPosition = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_switch_position",
		Help: "SIMULATED points position (0 = normal, 1 = reverse, 2 = moving).",
	}, []string{"switch_id"})
	railSwitchDetected = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_switch_detected",
		Help: "SIMULATED points detection (1 = detected, 0 = lost).",
	}, []string{"switch_id"})
	railSwitchLocked = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_switch_locked",
		Help: "SIMULATED points lock (1 = locked, 0 = free).",
	}, []string{"switch_id"})
	railTrainProgress = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_train_progress",
		Help: "SIMULATED train position, 0..1 along its current segment.",
	}, []string{"train_id", "segment_id"})
	railTrainSpeed = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_train_speed_kmh",
		Help: "SIMULATED train speed in km/h.",
	}, []string{"train_id"})
	railTrainDelay = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_train_delay_seconds",
		Help: "SIMULATED train delay in seconds.",
	}, []string{"train_id"})
	railTelemetryAge = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_telemetry_age_seconds",
		Help: "SIMULATED age of the last telemetry update per source.",
	}, []string{"source"})
	railRouteEstablished = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_route_established",
		Help: "SIMULATED route establishment (1 = set, 0 = torn down).",
	}, []string{"route_id"})
	railStale = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_stale",
		Help: "SIMULATED staleness flag per entity (1 = stale).",
	}, []string{"entity_id"})
	railPlcStatus = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_plc_status",
		Help: "SIMULATED PLC/RTU link status (1 = connected, 0 = disconnected).",
	}, []string{"device", "device_type"})
	railPlcLatency = promauto.NewGaugeVec(prometheus.GaugeOpts{
		Name: "wm_rail_plc_latency_ms",
		Help: "SIMULATED PLC/RTU polling latency in milliseconds.",
	}, []string{"device"})
)

var track1Blocks = []string{"t1-b01", "t1-b02", "t1-b03", "t1-b04", "t1-b05"}
var track2Blocks = []string{"t2-b01", "t2-b02", "t2-b03", "t2-b04", "t2-b05"}

type simRailTrain struct {
	id     string
	blocks []string
	// Seconds to traverse one block; also offsets so trains never collide.
	blockPeriod float64
	phaseOffset float64
	speedKmh    float64
	delaySec    float64
	// A stale train freezes: its series stop moving and wm_rail_stale = 1.
	stale bool
}

var simRailTrains = []simRailTrain{
	{id: "RD-218", blocks: track1Blocks, blockPeriod: 45, phaseOffset: 0, speedKmh: 62, delaySec: 0},
	{id: "RD-221", blocks: track1Blocks, blockPeriod: 45, phaseOffset: 110, speedKmh: 58, delaySec: 120},
	{id: "RD-305", blocks: track2Blocks, blockPeriod: 55, phaseOffset: 30, speedKmh: 47, delaySec: 45},
	// Deliberately stale: telemetry frozen mid-route to demo data-quality UX.
	{id: "RD-999", blocks: track2Blocks, blockPeriod: 55, phaseOffset: 200, speedKmh: 0, delaySec: 600, stale: true},
}

// simulateRail derives every value from wall-clock time, so restarts and
// screenshots are reproducible for the same instant and movement is smooth
// across scrapes.
func simulateRail(now time.Time) {
	t := float64(now.Unix())

	// Trains: position = where along the looped block sequence the clock puts
	// them. One progress series per (train, current block): Reset() drops the
	// previous block's series each tick, so the plugin's prefix binding
	// follows the train across blocks.
	occupied := map[string]bool{}
	railTrainProgress.Reset()
	for _, train := range simRailTrains {
		clock := t + train.phaseOffset
		if train.stale {
			clock = train.phaseOffset * 17
		}
		total := train.blockPeriod * float64(len(train.blocks))
		pos := clock - total*float64(int(clock/total))
		blockIndex := int(pos / train.blockPeriod)
		progress := (pos - float64(blockIndex)*train.blockPeriod) / train.blockPeriod
		block := train.blocks[blockIndex]

		railTrainProgress.WithLabelValues(train.id, block).Set(progress)
		railTrainSpeed.WithLabelValues(train.id).Set(train.speedKmh)
		railTrainDelay.WithLabelValues(train.id).Set(train.delaySec)
		if train.stale {
			railStale.WithLabelValues(train.id).Set(1)
		} else {
			railStale.WithLabelValues(train.id).Set(0)
		}
		occupied[block] = true
	}

	// Blocks: occupancy follows the trains; t1-b04 is under maintenance
	// (blocked) as a permanent demo state.
	for _, blocks := range [][]string{track1Blocks, track2Blocks} {
		track := "1"
		if blocks[0][0:2] == "t2" {
			track = "2"
		}
		for _, block := range blocks {
			occ := 0.0
			if occupied[block] {
				occ = 1
			}
			railTrackOccupied.WithLabelValues(block, track).Set(occ)
			available := 1.0
			if block == "t1-b04" {
				available = 0 // maintenance possession, matches the incident overlay
			}
			railTrackState.WithLabelValues(block, track).Set(available)
		}
	}
	// Depot branch: rarely used, occupied for one minute out of every ten.
	branchOccupied := 0.0
	if int(t/60)%10 == 0 {
		branchOccupied = 1
	}
	railTrackOccupied.WithLabelValues("t3-b01", "3").Set(branchOccupied)
	railTrackState.WithLabelValues("t3-b01", "3").Set(1)

	// Signals guard block entries on track 1: aspect derives from occupancy
	// ahead (occupied this block = stop, next block = caution, else clear).
	for i, block := range track1Blocks {
		signalID := []string{"s01", "s02", "s03", "s04", "s05"}[i]
		aspect := 2.0
		if occupied[block] {
			aspect = 0
		} else if i+1 < len(track1Blocks) && occupied[track1Blocks[i+1]] {
			aspect = 1
		}
		railSignalState.WithLabelValues(signalID).Set(aspect)
		railSignalHealth.WithLabelValues(signalID).Set(1)
	}
	// s06 (track 2 entry) has failed optics: health 0, aspect frozen at stop.
	railSignalState.WithLabelValues("s06").Set(0)
	railSignalHealth.WithLabelValues("s06").Set(0)

	// Switches: p1 (crossover entry) swings every 2 minutes with a short
	// "moving" transition; p2 (depot turnout) follows the branch occupancy.
	cycle := int(t) % 240
	switch {
	case cycle < 110:
		railSwitchPosition.WithLabelValues("p1").Set(0)
	case cycle < 120:
		railSwitchPosition.WithLabelValues("p1").Set(2)
	case cycle < 230:
		railSwitchPosition.WithLabelValues("p1").Set(1)
	default:
		railSwitchPosition.WithLabelValues("p1").Set(2)
	}
	railSwitchDetected.WithLabelValues("p1").Set(1)
	railSwitchLocked.WithLabelValues("p1").Set(1)

	if branchOccupied > 0 {
		railSwitchPosition.WithLabelValues("p2").Set(1)
	} else {
		railSwitchPosition.WithLabelValues("p2").Set(0)
	}
	// p2 has intermittent detection loss for two 20s windows each 5 minutes.
	if int(t)%300 < 20 {
		railSwitchDetected.WithLabelValues("p2").Set(0)
	} else {
		railSwitchDetected.WithLabelValues("p2").Set(1)
	}
	railSwitchLocked.WithLabelValues("p2").Set(0)

	// Route: the eastbound corridor route is established while p1 is normal.
	if cycle < 110 {
		railRouteEstablished.WithLabelValues("route-eb").Set(1)
	} else {
		railRouteEstablished.WithLabelValues("route-eb").Set(0)
	}

	railTelemetryAge.WithLabelValues("simulator").Set(float64(now.Second() % 5))

	// PLC/RTU gateway health, mimicking a read-only OT-DMZ poller's view:
	// steady links with a few ms of jitter, PLC-JCT degrading into high
	// latency for 20s of every minute, RTU-DEPOT disconnected outright.
	jitter := float64(int(t) % 7)
	railPlcStatus.WithLabelValues("PLC-YARD", "PLC").Set(1)
	railPlcLatency.WithLabelValues("PLC-YARD").Set(18 + jitter)
	railPlcStatus.WithLabelValues("PLC-STB", "PLC").Set(1)
	railPlcLatency.WithLabelValues("PLC-STB").Set(21 + jitter)
	railPlcStatus.WithLabelValues("PLC-JCT", "PLC").Set(1)
	if int(t)%60 < 20 {
		railPlcLatency.WithLabelValues("PLC-JCT").Set(165 + jitter)
	} else {
		railPlcLatency.WithLabelValues("PLC-JCT").Set(40 + jitter)
	}
	railPlcStatus.WithLabelValues("RTU-TERM", "RTU").Set(1)
	railPlcLatency.WithLabelValues("RTU-TERM").Set(22 + jitter)
	railPlcStatus.WithLabelValues("RTU-DEPOT", "RTU").Set(0)
	railPlcLatency.WithLabelValues("RTU-DEPOT").Set(0)
}
