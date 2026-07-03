package main

import "strconv"

// Reusable, vendor-neutral SVG faceplate components for rack drawings —
// modeled on common rear-panel layouts (RJ45 groups with yellow tabs, SFP
// cages, hot-swap PSU modules with fans, vent grilles, VGA/serial connectors,
// C13 PDU outlets). Compose these to draw device faceplates; weathermap
// status nodes are placed inside fpPortFrame frames so the live status square
// appears seated in a metal port opening.
//
// All coordinates are centers unless noted. Colors follow the dark demo theme.

func i2s(n int) string { return strconv.Itoa(n) }

// fpPortFrame draws a recessed metal opening sized to sit behind a small
// weathermap status node (~24x18): the node renders inside the frame.
func fpPortFrame(cx, cy int) string {
	return `<rect x="` + i2s(cx-15) + `" y="` + i2s(cy-12) + `" width="30" height="24" rx="3" fill="#0e1014" stroke="#4a5162" stroke-width="1.5"/>`
}

// fpGroupTab draws the yellow port-group marker strip common on switch
// faceplates, spanning x1..x2 at height y.
func fpGroupTab(x1, x2, y int) string {
	return `<rect x="` + i2s(x1) + `" y="` + i2s(y) + `" width="` + i2s(x2-x1) + `" height="3" rx="1.5" fill="#c9a227"/>`
}

// fpRJ45 draws a small realistic RJ45 jack (pin strip + clip notch) for
// decorative rows like patch panels where no status node overlays it.
func fpRJ45(cx, cy int) string {
	x, y := cx-8, cy-8
	return `<g><rect x="` + i2s(x) + `" y="` + i2s(y) + `" width="16" height="16" rx="2" fill="#0e1014" stroke="#39445a" stroke-width="1"/>` +
		`<rect x="` + i2s(x+3) + `" y="` + i2s(y+2) + `" width="10" height="3" fill="#2e3a4d"/>` +
		`<rect x="` + i2s(x+5) + `" y="` + i2s(y+12) + `" width="6" height="3" fill="#1b2330"/></g>`
}

// fpSFP draws an SFP/SFP+ cage with its pull tab.
func fpSFP(cx, cy int) string {
	x, y := cx-17, cy-7
	return `<g><rect x="` + i2s(x) + `" y="` + i2s(y) + `" width="34" height="14" rx="2" fill="#0e1014" stroke="#4a5162" stroke-width="1.2"/>` +
		`<rect x="` + i2s(x+3) + `" y="` + i2s(y+4) + `" width="20" height="6" fill="#1b2330"/>` +
		`<rect x="` + i2s(x+26) + `" y="` + i2s(y+3) + `" width="5" height="8" rx="1" fill="#3d4556"/></g>`
}

// fpFan draws a fan opening with blades, as on PSU modules and chassis vents.
func fpFan(cx, cy, r int) string {
	s := `<g><circle cx="` + i2s(cx) + `" cy="` + i2s(cy) + `" r="` + i2s(r) + `" fill="#0e1014" stroke="#39445a" stroke-width="1.2"/>`
	// four blades as arcs approximated with rotated ellipses
	for a := 0; a < 4; a++ {
		s += `<ellipse cx="` + i2s(cx) + `" cy="` + i2s(cy) + `" rx="` + i2s(r-3) + `" ry="3" fill="#232a38" transform="rotate(` + i2s(a*45) + ` ` + i2s(cx) + ` ` + i2s(cy) + `)"/>`
	}
	return s + `<circle cx="` + i2s(cx) + `" cy="` + i2s(cy) + `" r="3" fill="#3d4556"/></g>`
}

// fpPSU draws a hot-swap PSU module (fan + inlet area + latch). Place a
// weathermap status node over the inlet position to show power state.
func fpPSU(x, y int) string {
	return `<g><rect x="` + i2s(x) + `" y="` + i2s(y) + `" width="62" height="38" rx="3" fill="#1b2027" stroke="#4a5162" stroke-width="1.5"/>` +
		fpFan(x+16, y+19, 12) +
		`<rect x="` + i2s(x+34) + `" y="` + i2s(y+7) + `" width="24" height="24" rx="2" fill="#0e1014" stroke="#39445a" stroke-width="1"/>` +
		`<rect x="` + i2s(x+2) + `" y="` + i2s(y+34) + `" width="14" height="3" rx="1.5" fill="#c9a227"/></g>`
}

// fpVent draws a dot-grid ventilation grille w x h at top-left x,y.
func fpVent(x, y, w, h int) string {
	s := `<g fill="#0e1014">`
	for yy := y; yy < y+h; yy += 6 {
		off := 0
		if ((yy-y)/6)%2 == 1 {
			off = 3
		}
		for xx := x + off; xx < x+w; xx += 6 {
			s += `<circle cx="` + i2s(xx) + `" cy="` + i2s(yy) + `" r="1.6"/>`
		}
	}
	return s + `</g>`
}

// fpVGA draws a VGA/serial-style trapezoid connector.
func fpVGA(cx, cy int) string {
	return `<g><path d="M` + i2s(cx-12) + `,` + i2s(cy-6) + ` h24 l-4,12 h-16 Z" fill="#0e1014" stroke="#4a90b8" stroke-width="1.2"/>` +
		`<circle cx="` + i2s(cx-15) + `" cy="` + i2s(cy) + `" r="2" fill="#3d4556"/><circle cx="` + i2s(cx+15) + `" cy="` + i2s(cy) + `" r="2" fill="#3d4556"/></g>`
}

// fpC13 draws a C13 PDU outlet opening; a status node overlays it to show
// whether the outlet is energized.
func fpC13(cx, cy int) string {
	return `<rect x="` + i2s(cx-14) + `" y="` + i2s(cy-12) + `" width="28" height="24" rx="4" fill="#0e1014" stroke="#4a5162" stroke-width="1.5"/>`
}
