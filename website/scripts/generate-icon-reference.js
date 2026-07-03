#!/usr/bin/env node
/*
 * Generates the Icon Reference docs page (website/docs/icons.md) from the
 * icon sets bundled with the plugin (src/icons/<set>/*.svg), and copies the
 * SVGs into website/docs/img/icons/ so the docs site is self-contained.
 *
 * Regenerate after adding/removing icons:
 *   node website/scripts/generate-icon-reference.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src', 'icons');
const IMG_OUT = path.join(ROOT, 'website', 'docs', 'img', 'icons');
const PAGE_OUT = path.join(ROOT, 'website', 'docs', 'icons.md');

const RACK_DESCRIPTIONS = {
  'switch-1u-8port': '1U switch faceplate with 8 RJ45 ports and uplink cages',
  'switch-1u-24port': '1U switch faceplate with 24 RJ45 ports',
  'server-1u': '1U server rear: vents, two NICs, dual fans',
  'server-2u': '2U server rear: vent field, two NICs, dual fans',
  'patch-panel-1u': '1U patch panel with 12 RJ45 keystones',
  'blanking-panel-1u': '1U vented blanking panel',
  'psu-module': 'Hot-swap power supply module (fan + C14 inlet + latch)',
  fan: 'Chassis/PSU fan',
  'pdu-strip': 'Vertical 8-outlet PDU strip',
  'pdu-outlet': 'Single C13 PDU outlet',
  'rj45-port': 'Single RJ45 port',
  'sfp-cage': 'SFP/SFP+ cage with pull tab',
  'rack-frame': 'Empty rack frame with rail holes',
  ups: 'Rack UPS (battery symbol, vents, fan)',
  'cable-tray': 'Vertical cable management tray',
  'fiber-port-lc': 'LC duplex fiber port (aqua = OM3/OM4 convention)',
  'fiber-port-sc': 'SC fiber port (orange = multimode convention)',
  'fiber-patch-panel-1u': '1U fiber patch panel with 12 LC duplex pairs',
};

const AEROSPACE_DESCRIPTIONS = {
  airplane: 'Aircraft (top view) — air routes, in-flight connectivity',
  helicopter: 'Helicopter (side view)',
  satellite: 'Satellite with solar wings — space segment / SATCOM',
  'satellite-dish': 'Ground station dish — earth segment / VSAT',
  drone: 'Quadcopter drone (top view) — UAV links',
};

// A representative sample of the 265 flags shown as images; the rest are
// listed by code below the sample.
const FLAG_SAMPLE = [
  'us', 'ca', 'br', 'mx', 'gb', 'fr', 'de', 'it', 'es', 'nl', 'se', 'ch',
  'tr', 'ae', 'sa', 'qa', 'eg', 'za', 'ng', 'ke', 'in', 'cn', 'jp', 'kr',
  'sg', 'au',
];

const list = (set) =>
  fs
    .readdirSync(path.join(SRC, set))
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.slice(0, -4))
    .sort();

const copySet = (set) => {
  const out = path.join(IMG_OUT, set);
  fs.mkdirSync(out, { recursive: true });
  for (const name of list(set)) {
    fs.copyFileSync(path.join(SRC, set, name + '.svg'), path.join(out, name + '.svg'));
  }
};

const CELL =
  'display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:6px;' +
  'padding:10px 6px;border:1px solid rgba(128,128,128,.25);border-radius:6px;text-align:center;';

function grid(set, names, { dark = false, iconWidth = 44 } = {}) {
  const cellStyle = CELL + (dark ? 'background:#14161c;' : '');
  const cells = names
    .map(
      (n) =>
        `<div style="${cellStyle}"><img src="../img/icons/${set}/${n}.svg" alt="${n}" style="width:${iconWidth}px;max-width:100%;height:auto;" loading="lazy"><code style="font-size:.62rem;word-break:break-all;">${n}</code></div>`
    )
    .join('\n');
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:8px;" markdown="0">\n${cells}\n</div>`;
}

function descTable(set, names, descriptions) {
  const rows = names
    .map(
      (n) =>
        `<tr><td style="background:#14161c;text-align:center;padding:10px;"><img src="../img/icons/${set}/${n}.svg" alt="${n}" style="max-width:170px;height:auto;"></td><td><code>${set}/${n}</code></td><td>${descriptions[n] || ''}</td></tr>`
    )
    .join('\n');
  return `<table markdown="0">\n<thead><tr><th>Icon</th><th>Id</th><th>Description</th></tr></thead>\n<tbody>\n${rows}\n</tbody>\n</table>`;
}

// ---------------------------------------------------------------------------

const sets = {
  networking: list('networking'),
  rack: list('rack'),
  aerospace: list('aerospace'),
  platforms: list('platforms'),
  languages: list('languages'),
  computers_monitors: list('computers_monitors'),
  databases: list('databases'),
  cisco: list('cisco'),
  flags: list('flags'),
  flags_square: list('flags_square'),
};
for (const s of Object.keys(sets)) {
  copySet(s);
}
const total = Object.values(sets).reduce((a, b) => a + b.length, 0);

const flagRest = sets.flags.filter((f) => !FLAG_SAMPLE.includes(f));

const page = `# Icon Reference

The plugin bundles **${total} icons** across six sets, selectable per node in the editor
(**Nodes → Icon**). Every icon has an id of the form \`set/name\` — that id is what the
panel stores, and the icon is served from the plugin itself
(\`public/plugins/tamirsuliman-weathermap-panel/icons/<set>/<name>.svg\`), so maps need no
external image hosting.

!!! tip "Using icons"
    - Pick the icon from the grouped dropdown in the node's **Icon** section; set **Width**/**Height** (a new icon defaults to 40×40) and optional **padding**.
    - **Draw Inside** places the icon within the node's border instead of above the label.
    - Need something not bundled? Choose **Custom Icon** and paste any \`https://\` SVG/PNG URL.

---

## Networking (${sets.networking.length})

General-purpose network equipment and infrastructure symbols — routers, switches,
firewalls, servers, buildings, clouds, and more. The workhorse set for topology maps.

${grid('networking', sets.networking)}

---

## Rack Parts (${sets.rack.length})

Vendor-neutral construction elements for composing rack elevations directly from
node icons — faceplates, power components, and port hardware drawn in a consistent
dark style. Combine them with per-port status nodes to build boards like the
[rack cabling demo](guide/use-cases.md#11-rack-cabling-power-redundancy-multi-device-rear-view).

${descTable('rack', sets.rack, RACK_DESCRIPTIONS)}

---

## Aerospace (${sets.aerospace.length})

Air and space segment symbols — for SATCOM links, ground stations, in-flight or
UAV connectivity maps.

${descTable('aerospace', sets.aerospace, AEROSPACE_DESCRIPTIONS)}

---

## Platforms & Apps (${sets.platforms.length})

Kubernetes and Apache project logos (from the MIT-licensed
[devicon](https://github.com/devicons/devicon) project) — for maps where a node
is a service or platform. More Apache data platforms (Cassandra, Hadoop, HBase,
CouchDB) live in the Databases set below.

${grid('platforms', sets.platforms)}

---

## Programming Languages (${sets.languages.length})

Language logos (from [devicon](https://github.com/devicons/devicon), MIT) — for
application/service nodes tagged by their runtime.

${grid('languages', sets.languages)}

---

## Country Flags (${sets.flags.length} circle + ${sets.flags_square.length} square)

ISO 3166-1 alpha-2 flags in two styles for marking PoP/city nodes on
[geographic maps](guide/use-cases.md#9-global-backbone-on-a-world-map):
**circle** (\`flags/<code>\`, from [circle-flags](https://github.com/HatScripts/circle-flags), MIT)
and **square** (\`flags_square/<code>\`, from [flag-icons](https://github.com/lipis/flag-icons), MIT).
Use the two-letter country code as the icon name, e.g. \`flags/us\` or \`flags_square/us\`.

Circle sample:

${grid('flags', FLAG_SAMPLE, { iconWidth: 40 })}

Square sample:

${grid('flags_square', FLAG_SAMPLE.filter((f) => sets.flags_square.includes(f)), { iconWidth: 40 })}

??? note "All available codes"
    **Circle (${sets.flags.length}):** ${sets.flags.map((f) => '\`' + f + '\`').join(' · ')}

    **Square (${sets.flags_square.length}):** ${sets.flags_square.map((f) => '\`' + f + '\`').join(' · ')}

    (\`eu\` = European Union, \`un\` = United Nations, \`xx\` = placeholder/unknown.)

---

## Computers & Monitors (${sets.computers_monitors.length})

End-user and workstation hardware.

${grid('computers_monitors', sets.computers_monitors)}

---

## Databases & Data Platforms (${sets.databases.length})

Logos for common databases, queues, and data platforms — useful when a "node" on
your map is a data service rather than a network device.

${grid('databases', sets.databases)}

---

## Cisco (${sets.cisco.length})

The classic Cisco topology icon set — the full range of routers, switches,
security appliances, wireless, voice, and datacenter symbols familiar from
network diagrams.

${grid('cisco', sets.cisco)}

---

*This page is generated from the bundled icon sets — regenerate with*
\`node website/scripts/generate-icon-reference.js\` *after adding icons.*
`;

fs.writeFileSync(PAGE_OUT, page);
console.log(`wrote ${path.relative(process.cwd(), PAGE_OUT)} (${total} icons, ${Object.keys(sets).length} sets)`);
