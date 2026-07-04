# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.5.14](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.14) (2026-07-04)

### Features

* **vendor icon set — 49 bundled icons** (PR [#190](https://github.com/allamiro/grafana-network-weathermap-ng/pull/190)): 19 brand logos from the Simple Icons project (CC0) — Juniper, F5, Fortinet, Palo Alto Networks, MikroTik, Ubiquiti, Netgear, TP-Link, Huawei, SonicWall, Nokia, Ericsson, OPNsense, pfSense, OpenWrt, Dell, HP, Lenovo, Supermicro — plus 30 composite device icons (e.g. `vendors/juniper-router`, `vendors/f5-load-balancer`) combining Networking shapes with vendor corner badges. New **Vendors** group in the node icon picker; Icon Reference regenerated (1046 icons, 11 sets)

### Bug Fixes

* **panel crash resilience for malformed or partial weathermap options** — missing/partial `options.weathermap`, links referencing deleted nodes, and overlapping nodes (zero-length arrow vectors) no longer crash the panel; options are normalized before any dereference, malformed links are skipped, and SVG geometry can no longer contain `NaN` ([#198](https://github.com/allamiro/grafana-network-weathermap-ng/issues/198), PR [#206](https://github.com/allamiro/grafana-network-weathermap-ng/pull/206))
* **render purity** — the options-schema migration no longer mutates the incoming saved options object, and neither the panel nor the editor calls `onOptionsChange`/`onChange` during render; migrated options are persisted from guarded effects after commit ([#199](https://github.com/allamiro/grafana-network-weathermap-ng/issues/199), PR [#210](https://github.com/allamiro/grafana-network-weathermap-ng/pull/210))
* **numeric inputs never store `NaN`** — blank or mid-edit numeric fields (positions, panel size, zoom, offsets, icon sizes, thresholds, bandwidth) keep the previous valid value instead of writing `NaN` into saved options; `0` remains valid; the color-scale editor no longer leaks `NaN` into options through shared local edit state ([#200](https://github.com/allamiro/grafana-network-weathermap-ng/issues/200), PR [#211](https://github.com/allamiro/grafana-network-weathermap-ng/pull/211))
* **timeline and state synchronization** — the pan offset resyncs when saved options change externally (dashboard reload, another session); VIA-chain data resolution no longer mutates rendered link state (multi-VIA chains included); node status now replays the timeline scrub position with raw step-hold sampling, matching link values during incident replay ([#201](https://github.com/allamiro/grafana-network-weathermap-ng/issues/201), PR [#212](https://github.com/allamiro/grafana-network-weathermap-ng/pull/212))
* **self-link anchor accounting** — removing a self-link now decrements its shared anchor by 2 (mirroring add) and clamps at 0, so link spacing no longer drifts on affected nodes ([#202](https://github.com/allamiro/grafana-network-weathermap-ng/issues/202), PR [#209](https://github.com/allamiro/grafana-network-weathermap-ng/pull/209))
* **SVG export hardening** — relative, root-relative, and absolute icon URLs resolve correctly; `data:`/`blob:` hrefs (any scheme casing) are left untouched; a failed or CORS-blocked icon fetch keeps the original href instead of aborting the whole export ([#203](https://github.com/allamiro/grafana-network-weathermap-ng/issues/203), PR [#207](https://github.com/allamiro/grafana-network-weathermap-ng/pull/207))
* **deterministic mapping for duplicate display names** — when two series share a display name, link values now resolve from the first frame, consistently with the query dropdown and node status, instead of silently taking whichever duplicate arrived last ([#204](https://github.com/allamiro/grafana-network-weathermap-ng/issues/204), PR [#213](https://github.com/allamiro/grafana-network-weathermap-ng/pull/213))

### Chores (not part of the plugin archive)

* CI hardening — dedicated E2E workflow (weekly + manual) against Grafana 11 and latest, broader push path filters (including `.config/**`), consistent dependency installs between test and release, and a PR-time plugin archive layout check that reads the plugin id from `dist/plugin.json` ([#205](https://github.com/allamiro/grafana-network-weathermap-ng/issues/205), PR [#208](https://github.com/allamiro/grafana-network-weathermap-ng/pull/208))

## [1.5.13](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.13) (2026-07-04)

### Bug Fixes

* **query dropdown entries were indistinguishable** when a single query returned many series — the concise `refId: fieldName` labels introduced for [#49](https://github.com/allamiro/grafana-network-weathermap-ng/issues/49) collapsed to identical `A: Value` entries for multi-series Prometheus responses. Labels now show short display names (custom legends, label sets) verbatim, keep long unique names concise, and expand to the full label set whenever concise labels would collide; stored selections are unchanged ([#191](https://github.com/allamiro/grafana-network-weathermap-ng/issues/191), PR [#195](https://github.com/allamiro/grafana-network-weathermap-ng/pull/195))

### Chores (not part of the plugin archive)

* regression-hardening test suite — editor dropdown component tests, a duplicate-DOM-id guard, options-migration round-trip guarantees, a hostile-data render matrix, and a dist packaging verification step in CI and the signed release pipeline (PR [#196](https://github.com/allamiro/grafana-network-weathermap-ng/pull/196))
* least-privilege `GITHUB_TOKEN` permissions across CI workflows, resolving the open CodeQL alerts (PR [#194](https://github.com/allamiro/grafana-network-weathermap-ng/pull/194))
* docs site: step-by-step Getting Started/Links screenshots and the Dracula color scheme (PRs [#192](https://github.com/allamiro/grafana-network-weathermap-ng/pull/192), [#193](https://github.com/allamiro/grafana-network-weathermap-ng/pull/193))

## [1.5.12](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.12) (2026-07-03)

### Features

* **dense-map rendering/UX** ([#179](https://github.com/allamiro/grafana-network-weathermap-ng/issues/179), PR [#184](https://github.com/allamiro/grafana-network-weathermap-ng/pull/184)): six opt-in, default-off options — **single-direction links** (one full-length line and a single arrow for one-way flows like power feeds), **hover highlight** (the hovered link's whole VIA chain stays bright while unrelated links fade), **label collision avoidance**, **zoom-dependent value labels**, a built-in **status legend**, and **per-node font size/bold overrides**
* **icon library — 997 bundled icons across 10 sets** (PRs [#181](https://github.com/allamiro/grafana-network-weathermap-ng/pull/181), [#183](https://github.com/allamiro/grafana-network-weathermap-ng/pull/183)): country flags in circle (265) and square (257) styles, rack construction parts incl. fiber LC/SC ports and panels (18), Kubernetes + Apache project logos (9), programming languages (22), aerospace symbols (5) — with a generated [Icon Reference](https://allamiro.github.io/grafana-network-weathermap-ng/icons/) docs page listing every icon

### Bug Fixes

* **empty data frame crashed the panel** on maps with node status queries — the status-color lookup resolved frame names unguarded; one transient empty series (fresh exporter, scrape gap, regex matching nothing) latched the error boundary until reload. Status values now also read via the value-field helper instead of assuming field order ([#178](https://github.com/allamiro/grafana-network-weathermap-ng/issues/178), PR [#186](https://github.com/allamiro/grafana-network-weathermap-ng/pull/186))
* **status-legend overlay was painted over by the map SVG** — missing z-index (PR [#185](https://github.com/allamiro/grafana-network-weathermap-ng/pull/185))

### Chores (not part of the plugin archive)

* demo/testing: multi-device rack cabling with redundant power feeds ([#177](https://github.com/allamiro/grafana-network-weathermap-ng/issues/177)), the Interactive Rack View showcase for the new rendering features, docs use-cases 11–12, and the icon reference page

## [1.5.11](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.11) (2026-07-03)

### Chores

* **plugin-metadata**: the description shown in Grafana's visualization picker now credits the author — "Next-generation, actively maintained network weathermap by Tamir Suliman…" (PR [#172](https://github.com/allamiro/grafana-network-weathermap-ng/pull/172))
* **attribution**: added a NOTICE file (fork copyright, preserved upstream credit to Seth Knights, demo world-map asset provenance) that now ships inside the plugin archive per Apache-2.0 §4(d), the fork's copyright line in the LICENSE appendix, and a CITATION.cff enabling GitHub's "Cite this repository" button (PR [#173](https://github.com/allamiro/grafana-network-weathermap-ng/pull/173))
* **testing/docs** (not part of the plugin archive): simulated-WAN exporter and nine scenario demo dashboards with a step-by-step use-cases guide ([#170](https://github.com/allamiro/grafana-network-weathermap-ng/issues/170), PR [#171](https://github.com/allamiro/grafana-network-weathermap-ng/pull/171))

## [1.5.10](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.10) (2026-07-02)

### Bug Fixes

* **editor-form-ids**: explicit unique ids on the node/link picker Selects, the per-node icon Select, and the color-scale threshold inputs. Grafana 13's options pane assigns the options-item id to bare controls, which produced duplicate form field ids on Grafana 13; no behavior change on Grafana 11/12. Verified in-editor on Grafana 11.0.0, 12.0.0, 12.3.8, and 13.1.0 ([#167](https://github.com/allamiro/grafana-network-weathermap-ng/issues/167), PR [#168](https://github.com/allamiro/grafana-network-weathermap-ng/pull/168))

## [1.5.9](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.9) (2026-07-02)

Addresses all required changes from the Grafana plugin catalog review of v1.5.6 ([#162](https://github.com/allamiro/grafana-network-weathermap-ng/issues/162)).

### Bug Fixes

* **panel-editor**: opening the panel editor on dashboards saved before options schema v14 no longer throws `Cannot read properties of undefined (reading 'backgroundColor')` on Grafana 11.0.0 — the editor forms now render the migrated options directly instead of waiting for the migration to round-trip through `onChange` ([#162](https://github.com/allamiro/grafana-network-weathermap-ng/issues/162), PR [#163](https://github.com/allamiro/grafana-network-weathermap-ng/pull/163))
* **node-editor**: the Status Color Target control keeps its selected indicator when switching between Border, Background, and Both, and the browser no longer reports duplicate form field ids — radio groups now use stable deterministic ids and immutable option updates ([#162](https://github.com/allamiro/grafana-network-weathermap-ng/issues/162), PR [#164](https://github.com/allamiro/grafana-network-weathermap-ng/pull/164))

### Documentation

* **catalog-readme**: new user-focused README at `src/README.md` shown in the Grafana plugin catalog — what the plugin does, use cases, setup walkthrough, and screenshots; the root README remains the GitHub-facing document ([#162](https://github.com/allamiro/grafana-network-weathermap-ng/issues/162), PR [#165](https://github.com/allamiro/grafana-network-weathermap-ng/pull/165))

## [1.5.8](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.8) (2026-07-02)

### Features

* **timeline-slider**: an optional timeline slider (Panel Options → Link Options → "Timeline Slider") lets viewers scrub through the selected dashboard time range and see link values as they were at that moment — for incident retrospectives, trend analysis, and capacity planning. Off by default; a "Live" button returns to the latest/aggregate value ([#158](https://github.com/allamiro/grafana-network-weathermap-ng/issues/158), PR [#159](https://github.com/allamiro/grafana-network-weathermap-ng/pull/159))

## [1.5.7](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.7) (2026-07-02)

### Bug Fixes

* **macos-interactions**: pan, zoom, and multi-select now work on macOS. The Cmd (⌘) key is accepted everywhere Ctrl was used (viewport pan, node-drag suppression, multi-select), and zoom uses the dominant scroll axis so macOS Shift+scroll (remapped to horizontal) and trackpad gestures still zoom. Linux/Windows behaviour (Ctrl/Shift/middle-mouse, vertical scroll) is unchanged ([#57](https://github.com/allamiro/grafana-network-weathermap-ng/issues/57), PR [#156](https://github.com/allamiro/grafana-network-weathermap-ng/pull/156))

## [1.5.6](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.6) (2026-07-02)

### Features

* **via-canvas-editing**: manage VIA (intermediate waypoint) points directly on the canvas in edit mode — double-click a link to insert a VIA (splitting the link and preserving each side's query data), drag the VIA like any node to reposition it, and right-click a VIA to remove it and merge the segments back together. No change to the underlying connection-node model ([#67](https://github.com/allamiro/grafana-network-weathermap-ng/issues/67), PR [#153](https://github.com/allamiro/grafana-network-weathermap-ng/pull/153))

### Bug Fixes

* **tooltip-consistency**: custom link tooltip metric rows now use the per-side direction labels instead of hardcoded "Inbound"/"Outbound" wording, and a node tooltip no longer lingers with stale data if a drag begins while it is shown; the link dashboard-link click no longer fires while inserting a VIA in edit mode ([#146](https://github.com/allamiro/grafana-network-weathermap-ng/issues/146), [#147](https://github.com/allamiro/grafana-network-weathermap-ng/issues/147), PR [#154](https://github.com/allamiro/grafana-network-weathermap-ng/pull/154))

## [1.5.5](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.5) (2026-07-02)

### Features

* **value-display-modes**: the panel's "Value Display Mode" can now resolve each metric as an aggregate across the selected dashboard time range — **Average**, **Min**, **Max**, and **95th Percentile** are available alongside the existing **Last** (most recent point). Useful for capacity-planning views where a single-point snapshot is misleading ([#58](https://github.com/allamiro/grafana-network-weathermap-ng/issues/58), PR [#151](https://github.com/allamiro/grafana-network-weathermap-ng/pull/151))

## [1.5.4](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.4) (2026-07-02)

### Features

* **node-tooltips**: nodes now support hover tooltips showing additional metric values (latency, packet loss, CPU, or any bound query) — configure per-node metrics (label, query, units) in the node editor's Tooltip section ([#72](https://github.com/allamiro/grafana-network-weathermap-ng/issues/72), PR [#146](https://github.com/allamiro/grafana-network-weathermap-ng/pull/146))
* **link-direction-labels**: optional per-side "Direction Label" lets you explicitly name which side of a link is inbound vs outbound; the label is used in the hover tooltip, removing the implicit A/Z ambiguity ([#70](https://github.com/allamiro/grafana-network-weathermap-ng/issues/70), PR [#147](https://github.com/allamiro/grafana-network-weathermap-ng/pull/147))
* **arrow-meeting-point**: new per-link "Arrow Meeting Point (%)" slider shifts where the two directional arrows meet along a link, instead of the fixed 50% midpoint — useful for asymmetric links and vias ([#62](https://github.com/allamiro/grafana-network-weathermap-ng/issues/62), PR [#148](https://github.com/allamiro/grafana-network-weathermap-ng/pull/148))
* **background-follow-map**: new "Move With Map" toggle attaches the panel background image to the map canvas so it pans and zooms with the nodes and links, for backgrounds depicting buildings, zones, or floor plans ([#64](https://github.com/allamiro/grafana-network-weathermap-ng/issues/64), PR [#149](https://github.com/allamiro/grafana-network-weathermap-ng/pull/149))

## [1.5.3](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.3) (2026-07-02)

### Bug Fixes

* **security**: pin the transitive `form-data` dependency to `4.0.6` via an npm `overrides` entry, resolving the HIGH-severity CRLF-injection advisory GHSA-hmw2-7cc7-3qxx (affecting `>=4.0.0 <4.0.6`) that osv-scanner flagged in `package-lock.json`. `form-data` is a dev-only transitive dependency (via `jest-environment-jsdom` → `jsdom`) and is not part of the shipped plugin bundle; `npm audit` now reports 0 high/critical vulnerabilities. No plugin runtime changes from 1.5.2.

## [1.5.2](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.2) (2026-07-01)

### Features

* **node-link-tab**: new per-node **Open Link in Same Tab** toggle (`Node.openInSameTab`) in the node editor — when enabled, clicking a node's dashboard link navigates in the current tab (`_self`) instead of opening a new one (`_blank`); URL sanitization is unchanged and the default (off) preserves the existing new-tab behavior ([#61](https://github.com/allamiro/grafana-network-weathermap-ng/issues/61), PR [#136](https://github.com/allamiro/grafana-network-weathermap-ng/pull/136))

## [1.5.1](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.1) (2026-07-01)

### Bug Fixes

* **testing**: repair the `testing/` docker-compose stack — bump the exporter build image to `golang:1.25-alpine` to match its `go.mod` (the previous `1.21` image failed the build and prevented the stack from starting), and ensure the Grafana provisioning and dashboard files are readable inside the container regardless of the host checkout umask. `docker compose up --build` now starts Grafana with the plugin pre-loaded and sample data provisioned. No plugin runtime changes from 1.5.0.

## [1.5.0](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.5.0) (2026-07-01)

### Features

* **react-19**: replace the `react-draggable` `findDOMNode` fallback with an explicit `nodeRef`, fixing a `TypeError: ReactDOM.findDOMNode is not a function` crash on Grafana builds running React 19 while keeping node dragging fully functional on older versions.

### Bug Fixes

* **security**: validate and sanitize all user-provided URLs before use — dashboard links, custom node icon URLs, and the panel background image URL. Only safe relative Grafana paths and `http://`/`https://` absolute URLs are accepted; unsafe schemes (`javascript:`, `data:`, `file:`, `vbscript:`, `blob:`, protocol-relative `//`, and any other scheme) are rejected at input time and again at navigation/render time, preventing script execution via `window.open` or image sources.
* **export**: guard against a missing SVG element in the SVG export path so the panel editor no longer crashes when the expected element is not present.

### Metadata

* rename the plugin display name to **Network Weathermap NG** and clarify the description as the actively maintained next-generation continuation, distinguishing it from the deprecated `knightss27-weathermap-panel` plugin.

## [1.4.7](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.4.7) (2026-06-10)

### Features

* **node-color-metric**: nodes can now be colored dynamically based on a metric query value — threshold mappings in the node Status section assign colors when the query value meets or exceeds a threshold (highest matching threshold wins), replacing the previous exact-value match; a new **Color Target** toggle (Border / Background / Both) controls which part of the node is colored, enabling full background fill coloring for CPU utilization, temperature, availability score, and similar metrics; all changes are backward compatible (existing status queries and StatusDown color behavior unchanged) ([#68](https://github.com/allamiro/grafana-network-weathermap-ng/issues/68))

## [1.4.6](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.4.6) (2026-06-10)

### Features

* **tooltip-metrics**: link tooltip now supports additional metric rows (errors, discards, drops, latency, or any metric) — a new "Tooltip Extra Metrics" section in the link editor lets operators add any number of named metrics, each with an optional inbound query, outbound query, and independent unit formatter; added metrics appear as extra rows in the hover tooltip below the throughput section, resolved live from the panel's data frames ([#73](https://github.com/allamiro/grafana-network-weathermap-ng/issues/73))

## [1.4.5](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.4.5) (2026-06-10)

### Features

* **parallel-links**: support multiple links between the same two nodes with independent visual paths — a per-link "Link Offset" field (in the link editor, Link Options section) shifts the line perpendicularly to the A→Z direction; set positive/negative values on each parallel link to spread them apart; arrows, labels, and gradient coloring all follow the offset line correctly; zero or blank offset (default) preserves current straight-line behavior ([#63](https://github.com/allamiro/grafana-network-weathermap-ng/issues/63))

## [1.4.4](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.4.4) (2026-06-10)

### Features

* **link-decimals**: new global "Link Value Decimal Places" setting in Panel Options → Link Options — sets the number of decimal places for all link throughput labels (value text, bandwidth text, and percentage text); leave blank for automatic precision (existing behavior unchanged) ([#66](https://github.com/allamiro/grafana-network-weathermap-ng/issues/66), PR [#127](https://github.com/allamiro/grafana-network-weathermap-ng/pull/127))

## [1.4.3](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.4.3) (2026-06-10)

### Features

* **oversubscribed-scale**: color scale thresholds above 100% now work correctly for oversubscribed links — legend band sizing uses a dynamic ceiling (`max(101, highest_threshold + 1)`) instead of a hardcoded 101, fixing broken proportions when any threshold exceeds 100%; top-band label now shows `X%+` to indicate the color applies at or above that threshold ([#65](https://github.com/allamiro/grafana-network-weathermap-ng/issues/65), PR [#125](https://github.com/allamiro/grafana-network-weathermap-ng/pull/125))

## [1.4.2](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.4.2) (2026-06-10)

### Features

* **template-variables**: Grafana dashboard variables (`$var`, `${var}`) are now resolved at draw time across all user-entered string fields — node labels, node/link status queries, node/link dashboard links, link A/Z throughput queries, and link A/Z bandwidth queries; enables dynamic multi-site maps, variable-driven queries, and variable-based dashboard links without duplicating panels ([#77](https://github.com/allamiro/grafana-network-weathermap-ng/issues/77), PR [#123](https://github.com/allamiro/grafana-network-weathermap-ng/pull/123))

## [1.4.1](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.4.1) (2026-06-10)

### Features

* **link-port-labels**: configurable A-side and Z-side port/interface labels on links — enter interface names (e.g. `ge-0/0/0`) per side in the link editor; labels render adjacent to the link line at 25% from each endpoint, rotated to follow the link direction ([#71](https://github.com/allamiro/grafana-network-weathermap-ng/issues/71), PR [#119](https://github.com/allamiro/grafana-network-weathermap-ng/pull/119))
* **link-status**: per-link up/down status indicator — assign a status query to any link; when the value is 0 or absent the link renders in a configurable down color with a dashed stroke; optional blink animation draws attention to down links; overrides gradient/flow-animation rendering while down ([#56](https://github.com/allamiro/grafana-network-weathermap-ng/issues/56), PR [#120](https://github.com/allamiro/grafana-network-weathermap-ng/pull/120))
* **absolute-scale**: color scale mode toggle (Percentage / Absolute Value) — in absolute mode, threshold values are compared directly against raw metric values instead of percentage of max bandwidth, enabling dBm, SNR, latency, and other non-percentage scales; the color scale legend adapts to show value ranges; backward-compatible (existing configs default to percentage mode) ([#60](https://github.com/allamiro/grafana-network-weathermap-ng/issues/60), PR [#121](https://github.com/allamiro/grafana-network-weathermap-ng/pull/121))

## [1.4.0](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.4.0) (2026-06-10)

### Features

* **node-status**: configurable status value mappings per node — map any query value to a border color (e.g. Mikrotik: 1=UP/green, 2=DOWN/red, 3=Testing/yellow); replaces the binary `<1 = down` rule when mappings are configured; existing nodes with no mappings are unaffected ([#75](https://github.com/allamiro/grafana-network-weathermap-ng/issues/75), PR [#116](https://github.com/allamiro/grafana-network-weathermap-ng/pull/116))
* **link-icon-boundary**: new per-node "Attach Links to Icon Boundary" toggle (`useIconBoundaryForLinks`) — when enabled, link attachment points shift to the icon edge instead of the label-rectangle edge for nodes with external icons (`drawInside: false`), eliminating visual pass-through on large icons ([#78](https://github.com/allamiro/grafana-network-weathermap-ng/issues/78), PR [#115](https://github.com/allamiro/grafana-network-weathermap-ng/pull/115))
* **link-visualization**: three new link display options — dynamic stroke width (scales with bandwidth utilization), flow animation (animated dashes showing traffic direction), and gradient coloring (per-link SVG gradient blending A-side and Z-side scale colors) ([#79](https://github.com/allamiro/grafana-network-weathermap-ng/issues/79), PR [#114](https://github.com/allamiro/grafana-network-weathermap-ng/pull/114))
* **node-enhancements**: label visibility toggle (show/hide node label independently of node), duplicate node button (copies node with offset position and cleared anchors), icon aspect-ratio lock toggle in node editor ([#80](https://github.com/allamiro/grafana-network-weathermap-ng/issues/80), PR [#113](https://github.com/allamiro/grafana-network-weathermap-ng/pull/113))

## [1.3.1](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.3.1) (2026-06-10)

### Bug Fixes

* **plugin.json**: lower minimum Grafana dependency from `>=12.0.0` to `>=11.0.0` — levitate API compatibility checks pass for Grafana 11.0.0 and above; the `>=12.0.0` restriction was overly conservative

## [1.3.0](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.3.0) (2026-06-10)

### Chores

* **ci**: switch release workflow to `grafana/plugin-actions/build-plugin` with provenance attestation (`attestation: true`) and `GRAFANA_ACCESS_POLICY_TOKEN`; drop deprecated `GRAFANA_API_KEY`; fixes `no-provenance-attestation` Grafana validator warning
* **plugin.json**: add sponsor link; fixes `sponsorshiplink` Grafana validator warning
* **testing/exporter**: upgrade `golang.org/x/sys` to `v0.44.0`; fixes `GO-2026-5024` (`govulncheck` module-level finding, Windows integer overflow)

## [1.2.0](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.2.0) (2026-06-09)

### Bug Fixes

* **query-matching**: links intermittently showed `n/a` despite valid query data — `getDataFrameName` was not passing `allFrames` to `getFieldDisplayName`, so Grafana could not disambiguate multiple series sharing the same field name; frame ordering (non-deterministic between refreshes) determined which series matched ([#54](https://github.com/allamiro/grafana-network-weathermap-ng/issues/54), PR [#102](https://github.com/allamiro/grafana-network-weathermap-ng/pull/102))
* **performance**: panel editor lag and slow re-render on large weathermaps — `generateDrawnLink` rebuilt the full data-frame value array from scratch for every link, O(links × frames) per refresh; replaced with a `useMemo`-cached `Map<name, value>` computed once per data change, reducing to O(frames) total ([#47](https://github.com/allamiro/grafana-network-weathermap-ng/issues/47), [#48](https://github.com/allamiro/grafana-network-weathermap-ng/issues/48), PR [#103](https://github.com/allamiro/grafana-network-weathermap-ng/pull/103))
* **tooltip-graph**: mini graph in link tooltip showed flat line or incorrect time axis — two root causes: (1) `let copy = frame` was a reference copy that permanently mutated field configs in `data.series`; (2) `tweakScale`/`tweakAxis` ran on the time field as well as value fields, distorting the x-axis range and applying the bps formatter to time labels ([#55](https://github.com/allamiro/grafana-network-weathermap-ng/issues/55), PR [#104](https://github.com/allamiro/grafana-network-weathermap-ng/pull/104))

## [1.1.3](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.1.3) (2026-06-09)

### Chores

* replace `nodejs.org` badge link in `README.md` with `CONTRIBUTING.md` link
* upgrade `testing/exporter` Go dependencies to resolve `govulncheck` CVEs (GO-2022-0322, GO-2026-5037, GO-2026-5039)

## [1.1.2](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.1.2) (2026-06-09)

### Bug Fixes

* **security**: add `noopener,noreferrer` to all `window.open()` calls — prevents tab-nabbing vulnerability on dashboard link clicks ([#98](https://github.com/allamiro/grafana-network-weathermap-ng/pull/98))
* **api**: replace direct `window.location` access with `locationService.getSearch()` from `@grafana/runtime` ([#98](https://github.com/allamiro/grafana-network-weathermap-ng/pull/98))

### Chores

* remove debug `console.log` calls from `utils.ts` and `WeathermapBuilder.tsx`
* move developer setup docs to `CONTRIBUTING.md`; fix relative LICENSE link in `README.md`

## [1.1.1](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.1.1) (2026-06-09)

### Security

* resolve all npm audit CVEs — 0 vulnerabilities remaining ([#96](https://github.com/allamiro/grafana-network-weathermap-ng/pull/96))
  * `form-data` critical — resolved via `npm audit fix`
  * `protobufjs` critical — resolved via `npm audit fix`
  * `serialize-javascript` high (build-time) — pinned to 7.0.5 via npm overrides
  * `dompurify` high (Grafana peer dep) — pinned to 3.4.8 via npm overrides
  * `js-cookie` high (Grafana peer dep) — pinned to 3.0.8 via npm overrides
  * `uuid` moderate — bumped direct dep to ^11.1.1; scoped override for @grafana/ui

## [1.1.0](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.1.0) (2026-06-09)

### Bug Fixes

* **color-scale**: threshold labels overlapped when thresholds were close together due to hardcoded `line-height: 0px` — now uses `line-height: normal` with `white-space: nowrap` ([#44](https://github.com/allamiro/grafana-network-weathermap-ng/issues/44))
* **export**: JSON export button was commented out and unavailable — restored with full-config export using `JSON.stringify` ([#52](https://github.com/allamiro/grafana-network-weathermap-ng/issues/52))
* **link-editor**: query dropdown showed only 2 entries due to missing `fields.length < 2` guard causing frames to be silently skipped; added deduplication and `menuShouldPortal` ([#42](https://github.com/allamiro/grafana-network-weathermap-ng/issues/42), [#46](https://github.com/allamiro/grafana-network-weathermap-ng/issues/46))
* **link-editor**: query dropdown labels showed full Grafana metadata strings (refId + frame name + all labels) — now displays concise `refId: fieldName` format while preserving the full name as the stored value ([#49](https://github.com/allamiro/grafana-network-weathermap-ng/issues/49))
* **value-extraction**: Prometheus `rate()` and `increase()` queries produced NaN or negative values — added backwards scan for last valid value and clamped negatives to 0 in both last-value and average modes ([#51](https://github.com/allamiro/grafana-network-weathermap-ng/issues/51))
* **tooltip**: tooltip appeared directly on top of hovered link with no cursor offset and could overflow panel edges — now offsets 14px right/10px up from cursor and flips direction near panel edges ([#43](https://github.com/allamiro/grafana-network-weathermap-ng/issues/43))
* **strokes**: link stroke lines randomly disappeared after zoom, pan, or time range change — two root causes fixed: `Math.max(...[])` returning `-Infinity` for empty anchor arrays (producing non-finite SVG coordinates), and zoom handler mutating `options.weathermap` in-place bypassing React change detection ([#45](https://github.com/allamiro/grafana-network-weathermap-ng/issues/45), [#50](https://github.com/allamiro/grafana-network-weathermap-ng/issues/50))
* **datasource-compat**: metrics from Check MK and other non-standard datasources showed n/a because the plugin hardcoded `fields[1]` for value extraction; now finds the first `FieldType.number` field with fallback to index 1 ([#53](https://github.com/allamiro/grafana-network-weathermap-ng/issues/53))

### CI / Infrastructure

* upgraded all GitHub Actions workflows from Node.js 20 to Node.js 24 ahead of the GitHub Actions forced cutover on 2026-06-16
* switched GitHub Pages deployment from `peaceiris/actions-gh-pages` to official `actions/deploy-pages` — surfaces live site URL in the repo sidebar Deployments section
* added `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` to all four workflows

## [1.0.0](https://github.com/allamiro/grafana-network-weathermap-ng/releases/tag/v1.0.0) (2025-02-25)

Modernized fork of the original knightss27-weathermap-panel, now maintained by Tamir Suliman.

### Features

* **Grafana 10–12.x support**: upgraded all `@grafana/*` dependencies to v11, tested on Grafana 12.0.0
* **React 18**: migrated from React 17 to React 18
* **TypeScript 5.x**: upgraded from TypeScript 4.x
* **Node 20+**: minimum Node.js version raised from 14 to 20
* **Playwright E2E**: replaced Cypress with `@grafana/plugin-e2e` + Playwright
* **Provisioned test environment**: docker-compose setup with Prometheus + exporter for reviewers

### Code Modernization

* migrated `emotion` → `@emotion/css` across all components
* replaced deprecated `stylesFactory` → `useStyles2` in all 8 component files
* replaced deprecated `Vector.get()` API → direct array indexing
* removed all `@ts-ignore` comments, added proper type assertions
* updated plugin identity to `tamirsuliman-weathermap-panel`
* modernized GitHub Actions release workflow

### [0.4.3](https://github.com/knightss27/grafana-network-weathermap/compare/v0.4.2...v0.4.3) (2023-07-18)


### Bug Fixes

* add try-catch calls to get series names ([#46](https://github.com/knightss27/grafana-network-weathermap/issues/46)) ([192dc26](https://github.com/knightss27/grafana-network-weathermap/commit/192dc265550fffe8fb8eb0c6a65911f1fd75c7de))

### [0.4.2](https://github.com/knightss27/grafana-network-weathermap/compare/v0.3.6...v0.4.2) (2023-07-05)

### Features

- background images (from urls!) ([#5](https://github.com/knightss27/grafana-network-weathermap/issues/5)) ([b00ad48](https://github.com/knightss27/grafana-network-weathermap/commit/b00ad48dd91911bc7a990212eb428bf5ebbb92c2))
- custom node icons ([#60](https://github.com/knightss27/grafana-network-weathermap/issues/60)) ([68d9b71](https://github.com/knightss27/grafana-network-weathermap/commit/68d9b717f2090ba632219ee8a0e9e6e3ef5a7f72))
- select and drag multipl nodes ([03c8d9c](https://github.com/knightss27/grafana-network-weathermap/commit/03c8d9c368d83fe136d2aaa7e10b1a4d71cd80f9))

### Bug Fixes

- display all data on connection links ([580206b](https://github.com/knightss27/grafana-network-weathermap/commit/580206b408260b3bee17a3e53054a96388c02d3c))
- link labels now hoverable ([f6d1ea3](https://github.com/knightss27/grafana-network-weathermap/commit/f6d1ea3550ebca76c40650361bc3ecdbf9033f5f))
- temp changes no longer written to state ([#61](https://github.com/knightss27/grafana-network-weathermap/issues/61)) ([cb6d3e3](https://github.com/knightss27/grafana-network-weathermap/commit/cb6d3e32876175ed32ea6c6ac934252d65f01e74))
- update grafana dependency ([323eaec](https://github.com/knightss27/grafana-network-weathermap/commit/323eaecbc8a7bf7d9f984d7dbc5ccb3234dfbe62))

### [0.4.1](https://github.com/knightss27/grafana-network-weathermap/compare/v0.3.6...v0.4.1) (2023-07-05)

### Features

- background images (from urls!) ([#5](https://github.com/knightss27/grafana-network-weathermap/issues/5)) ([b00ad48](https://github.com/knightss27/grafana-network-weathermap/commit/b00ad48dd91911bc7a990212eb428bf5ebbb92c2))
- custom node icons ([#60](https://github.com/knightss27/grafana-network-weathermap/issues/60)) ([68d9b71](https://github.com/knightss27/grafana-network-weathermap/commit/68d9b717f2090ba632219ee8a0e9e6e3ef5a7f72))
- select and drag multipl nodes ([03c8d9c](https://github.com/knightss27/grafana-network-weathermap/commit/03c8d9c368d83fe136d2aaa7e10b1a4d71cd80f9))

### Bug Fixes

- display all data on connection links ([580206b](https://github.com/knightss27/grafana-network-weathermap/commit/580206b408260b3bee17a3e53054a96388c02d3c))
- link labels now hoverable ([f6d1ea3](https://github.com/knightss27/grafana-network-weathermap/commit/f6d1ea3550ebca76c40650361bc3ecdbf9033f5f))
- temp changes no longer written to state ([#61](https://github.com/knightss27/grafana-network-weathermap/issues/61)) ([cb6d3e3](https://github.com/knightss27/grafana-network-weathermap/commit/cb6d3e32876175ed32ea6c6ac934252d65f01e74))

### [0.3.6](https://github.com/knightss27/grafana-network-weathermap/compare/v0.3.5...v0.3.6) (2023-03-26)

### Features

- customizable tooltip graph scaling ([#50](https://github.com/knightss27/grafana-network-weathermap/issues/50)) ([979868b](https://github.com/knightss27/grafana-network-weathermap/commit/979868b3d6b265c518a855d042ba50350d083962))

### Bug Fixes

- 0 values no longer treated as null ([#51](https://github.com/knightss27/grafana-network-weathermap/issues/51)) ([56481a3](https://github.com/knightss27/grafana-network-weathermap/commit/56481a38a1441dd749e7ee9ab8f26b5fd0f1cf38))
- do not assume field existence ([#46](https://github.com/knightss27/grafana-network-weathermap/issues/46)) ([f895bea](https://github.com/knightss27/grafana-network-weathermap/commit/f895bea898e859348130959b59bc2bec6a82eaf6))
- missing bandwidth queries default back to 0 ([612973e](https://github.com/knightss27/grafana-network-weathermap/commit/612973e5341dfdd9540a809f633ffcaf8732d844))
- overwrite last values when query is null ([#47](https://github.com/knightss27/grafana-network-weathermap/issues/47)) ([f34afd2](https://github.com/knightss27/grafana-network-weathermap/commit/f34afd2e641b081265565712d0fb10eab461670e))
- timestamp uses correct end of timerange ([56b8d34](https://github.com/knightss27/grafana-network-weathermap/commit/56b8d34f3fec5015733c84ba0f767b3c38fced39))

### [0.3.5](https://github.com/knightss27/grafana-network-weathermap/compare/v0.3.4...v0.3.5) (2023-01-25)

### Features

- dashboard links open in new tab ([2f45eba](https://github.com/knightss27/grafana-network-weathermap/commit/2f45eba0744a724412a77a1dea30add4ea9a124a))
- graphs ([#41](https://github.com/knightss27/grafana-network-weathermap/issues/41), [#11](https://github.com/knightss27/grafana-network-weathermap/issues/11)) ([297b980](https://github.com/knightss27/grafana-network-weathermap/commit/297b98084d0dc04ab9b87030cba0bdf240400271))
- node-specific dashboard links ([#36](https://github.com/knightss27/grafana-network-weathermap/issues/36)) ([5a9f51f](https://github.com/knightss27/grafana-network-weathermap/commit/5a9f51fad90d3f2a5431bb4de8a45f378de1d77b))

### [0.3.4](https://github.com/knightss27/grafana-network-weathermap/compare/v0.3.3...v0.3.4) (2022-12-13)

### Features

- configurable default link units ([#34](https://github.com/knightss27/grafana-network-weathermap/issues/34)) ([7a2acf7](https://github.com/knightss27/grafana-network-weathermap/commit/7a2acf7a635fd4df659f79f92599732cc8442342))
- expose zoom level and offsets ([#32](https://github.com/knightss27/grafana-network-weathermap/issues/32)) ([d9d3645](https://github.com/knightss27/grafana-network-weathermap/commit/d9d36450bb1c11031fd6ce6f3189b75fbd19a120))
- zoom outside of edit mode with shift key ([#32](https://github.com/knightss27/grafana-network-weathermap/issues/32)) ([78f0aa7](https://github.com/knightss27/grafana-network-weathermap/commit/78f0aa76aea072362dfcf9b1fed9ee2c426c89ca))

### Bug Fixes

- clearable select fields ([#31](https://github.com/knightss27/grafana-network-weathermap/issues/31)) ([3bdb782](https://github.com/knightss27/grafana-network-weathermap/commit/3bdb7823b061ea783a9b895d0b3fe09011e8d5f7))
- defaults data rate back to SI bits/sec ([#34](https://github.com/knightss27/grafana-network-weathermap/issues/34)) ([790a624](https://github.com/knightss27/grafana-network-weathermap/commit/790a62421dc8d34823f7e974fbfc46bb28df65f1))

### [0.3.3](https://github.com/knightss27/grafana-network-weathermap/compare/v0.3.2...v0.3.3) (2022-10-24)

### Bug Fixes

- use Grafana's dataframe display method ([fecbf17](https://github.com/knightss27/grafana-network-weathermap/commit/fecbf174ab36a49ec4234f60cbe99284f5bb6843))

### [0.3.2](https://github.com/knightss27/grafana-network-weathermap/compare/v0.3.1...v0.3.2) (2022-10-23)

### Features

- node DOWN status borders ([#17](https://github.com/knightss27/grafana-network-weathermap/issues/17)) ([aa7986a](https://github.com/knightss27/grafana-network-weathermap/commit/aa7986a50812441e43151e0416a9c9fa0cbaaa4b))
- percentage throughput on labels ([#24](https://github.com/knightss27/grafana-network-weathermap/issues/24)) ([68d8079](https://github.com/knightss27/grafana-network-weathermap/commit/68d8079b9c175fd1f3d04c31d972c2f69821d840))
- show all as percentage toggle ([#24](https://github.com/knightss27/grafana-network-weathermap/issues/24)) ([618b9e1](https://github.com/knightss27/grafana-network-weathermap/commit/618b9e10b00ba2cf775c5ecfd70a90fbd439ccf3))
- timestamp toggling ([#23](https://github.com/knightss27/grafana-network-weathermap/issues/23)) ([6ada467](https://github.com/knightss27/grafana-network-weathermap/commit/6ada467f7697fe8abfccb51b25865e04aedc0630))
- variable link/arrow widths ([#4](https://github.com/knightss27/grafana-network-weathermap/issues/4)) ([0563f96](https://github.com/knightss27/grafana-network-weathermap/commit/0563f96948e5e17fdaf36ac628f32771fbe02f8d))

### Bug Fixes

- handle expressions, unlabeled queries ([#12](https://github.com/knightss27/grafana-network-weathermap/issues/12)) ([09f5c32](https://github.com/knightss27/grafana-network-weathermap/commit/09f5c32771ceb91b655dd4b1543faa5c4c75b48c))
- outline invisible color pickers ([#19](https://github.com/knightss27/grafana-network-weathermap/issues/19)) ([7bdc5f0](https://github.com/knightss27/grafana-network-weathermap/commit/7bdc5f02b078c9fcf487c2a1bd946ffad023ece7))
- use field names where possible ([#29](https://github.com/knightss27/grafana-network-weathermap/issues/29)) ([11d1b12](https://github.com/knightss27/grafana-network-weathermap/commit/11d1b125a9322e5fc1344ea86c4e93d8326206cb))

### [0.3.1](https://github.com/knightss27/grafana-network-weathermap/compare/v0.3.0...v0.3.1) (2022-08-20)

### Bug Fixes

- sliders are the proper width ([#16](https://github.com/knightss27/grafana-network-weathermap/issues/16)) ([d320f0e](https://github.com/knightss27/grafana-network-weathermap/commit/d320f0ed01b78d2b2188f46df122e1572799840d))

## [0.3.0](https://github.com/knightss27/grafana-network-weathermap/compare/v0.2.8...v0.3.0) (2022-08-19)

### Features

- customizable tooltips ([#15](https://github.com/knightss27/grafana-network-weathermap/issues/15)) ([a5e2440](https://github.com/knightss27/grafana-network-weathermap/commit/a5e2440889389a5c41d2f098809a4ccdb98d0b0c))
- decimal percentages in color scale ([#6](https://github.com/knightss27/grafana-network-weathermap/issues/6)) ([0ce987c](https://github.com/knightss27/grafana-network-weathermap/commit/0ce987c6b19f4f1a08abd2681d8ab60b34b31ae6))
- link turns/connections ([#10](https://github.com/knightss27/grafana-network-weathermap/issues/10)) ([ea4abfc](https://github.com/knightss27/grafana-network-weathermap/commit/ea4abfcd538e3dd4003b9c83a68338be786a556f))
- link-specific units ([8373e2a](https://github.com/knightss27/grafana-network-weathermap/commit/8373e2af609432938b97d14bf988f19df5dcc81a))
- load scale customization ([#10](https://github.com/knightss27/grafana-network-weathermap/issues/10)) ([6b636b2](https://github.com/knightss27/grafana-network-weathermap/commit/6b636b270630ce2d098eece8e1dc95f91bbff4fb))

### Bug Fixes

- basic setup correctly adds link ([d3fabd7](https://github.com/knightss27/grafana-network-weathermap/commit/d3fabd7a529f3cec59fbce14ab7de39f27a849d7))
- clearing all links resets node height/width ([809b914](https://github.com/knightss27/grafana-network-weathermap/commit/809b914568168f89f6b8be0241d012f6d75b63e1))

### [0.2.8](https://github.com/knightss27/grafana-network-weathermap/compare/v0.2.7...v0.2.8) (2022-06-16)

### Features

- dashboard linking on link click ([#9](https://github.com/knightss27/grafana-network-weathermap/issues/9)) ([74005ed](https://github.com/knightss27/grafana-network-weathermap/commit/74005ed234498d44fcc7d5f510fd59e452a425f9))

### Bug Fixes

- file upload limits ([d1f5d48](https://github.com/knightss27/grafana-network-weathermap/commit/d1f5d48ae4a8c1f4bf6bd81d816eeb53c811837a))
- image upload error handling ([a26ce9b](https://github.com/knightss27/grafana-network-weathermap/commit/a26ce9bf57951d2db12877ca83a56b5de4cbd33b))
- state changes merged for backwards compatability ([cdc8957](https://github.com/knightss27/grafana-network-weathermap/commit/cdc89578fb91d2f53c231bbb02155ba91c7c5d65))
- stop zooming outside of edit mode ([29a7439](https://github.com/knightss27/grafana-network-weathermap/commit/29a7439960f9c1d7dc2ea722fad7dbc4777bd730))

### [0.2.7](https://github.com/knightss27/grafana-network-weathermap/compare/v0.2.6...v0.2.7) (2022-05-28)

### Features

- ability to set background images ([b21185f](https://github.com/knightss27/grafana-network-weathermap/commit/b21185fe98d5e6dd17418646a67062b8cd4785ac))
- add issue templates ([b134495](https://github.com/knightss27/grafana-network-weathermap/commit/b1344959b3e4e396d766bac7366a66d23d4b74b6))
- custom node images ([a72cd31](https://github.com/knightss27/grafana-network-weathermap/commit/a72cd316995a522f6e15ec8481be3d5a56986d6f))

### Bug Fixes

- update bug report template ([9729460](https://github.com/knightss27/grafana-network-weathermap/commit/9729460085f0d44196c7486915da9ca74c417537))

### [0.2.6](https://github.com/knightss27/grafana-network-weathermap/compare/v0.2.5...v0.2.6) (2022-05-10)

### Bug Fixes

- JSON export no longer breaks map state ([35eac8d](https://github.com/knightss27/grafana-network-weathermap/commit/35eac8df211c3f8264f18d7becd9e9ff1dea812c))

### [0.2.5](https://github.com/knightss27/grafana-network-weathermap/compare/v0.2.4...v0.2.5) (2022-05-04)

### Bug Fixes

- update plugin.json grafanaDependency ([6c3505e](https://github.com/knightss27/grafana-network-weathermap/commit/6c3505efc271f41c3f6394cdb8505b7df810344e))

### [0.2.4](https://github.com/knightss27/grafana-network-weathermap/compare/v0.2.3...v0.2.4) (2022-04-23)

### Features

- basic layout on creation ([c1716f9](https://github.com/knightss27/grafana-network-weathermap/commit/c1716f9791ab675c287ac4e0794360a86f40c286))

### Bug Fixes

- assume last node color for new nodes ([4369bd0](https://github.com/knightss27/grafana-network-weathermap/commit/4369bd0fbfbe02531c6c9841029a9e5f522ccbae))
- grid guides consistently viewable ([ab8ae51](https://github.com/knightss27/grafana-network-weathermap/commit/ab8ae51500506ae696564eb470bf848a263b887e))
- place new nodes at center of view ([94d702e](https://github.com/knightss27/grafana-network-weathermap/commit/94d702e4b8f682e8e42a0d52d945bee97c7a3142))

### [0.2.3](https://github.com/knightss27/grafana-network-weathermap/compare/v0.2.2...v0.2.3) (2022-03-12)

### Bug Fixes

- clean up ([02b6df0](https://github.com/knightss27/grafana-network-weathermap/commit/02b6df0323eeb69ce02bcf81147edf458f134a5d))

### [0.2.2](https://github.com/knightss27/grafana-network-weathermap/compare/v0.1.0...v0.2.2) (2022-02-27)

### Features

- data frame documentation ([1126718](https://github.com/knightss27/grafana-network-weathermap/commit/1126718a7155a7fea04315955b7e654f86359a1c))

### Bug Fixes

- re-work testing environment for earlier version ([3367c1b](https://github.com/knightss27/grafana-network-weathermap/commit/3367c1b5ae7293369d2bafdca9b15935ccb9c855))
- run npm audit ([5cadc0e](https://github.com/knightss27/grafana-network-weathermap/commit/5cadc0e46c9ad916befb8c8b2aeaea89d8d44784))
- typing errors ([55ba0fe](https://github.com/knightss27/grafana-network-weathermap/commit/55ba0fec13207619605e42dec61c7a33e618ae84))
