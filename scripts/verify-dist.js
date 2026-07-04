#!/usr/bin/env node
/*
 * Packaging sanity check, run in CI after `npm run build`.
 *
 * Catches "the build config drifted" regressions before they reach a signed
 * release: version mismatches between package.json and the built plugin.json,
 * icon sets missing from dist (webpack copy config), and required metadata
 * files not making it into the archive.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const failures = [];

const check = (ok, message) => {
  if (!ok) {
    failures.push(message);
  }
};

// 1. dist exists and carries the module + metadata files.
check(fs.existsSync(DIST), 'dist/ does not exist — run npm run build first');
for (const f of ['module.js', 'plugin.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'NOTICE']) {
  check(fs.existsSync(path.join(DIST, f)), `dist/${f} is missing`);
}

// 2. plugin.json version must match package.json (a release built from a
// stale dist would otherwise ship the wrong version silently).
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(DIST, 'plugin.json'), 'utf8'));
  check(
    plugin.info.version === pkg.version,
    `version mismatch: dist/plugin.json has ${plugin.info.version}, package.json has ${pkg.version}`
  );
  check(plugin.id === 'tamirsuliman-weathermap-panel', `unexpected plugin id: ${plugin.id}`);

  // Screenshots and logos declared in plugin.json must exist in dist.
  const assets = [
    ...(plugin.info.logos ? Object.values(plugin.info.logos) : []),
    ...(plugin.info.screenshots ?? []).map((s) => s.path),
  ];
  for (const rel of assets) {
    check(fs.existsSync(path.join(DIST, rel)), `plugin.json references missing asset: ${rel}`);
  }
} catch (e) {
  failures.push(`could not compare versions: ${e.message}`);
}

// 3. Every icon set in src/icons must reach dist/icons with the same file
// count (guards the webpack CopyPlugin config).
const srcIcons = path.join(ROOT, 'src', 'icons');
const distIcons = path.join(DIST, 'icons');
check(fs.existsSync(distIcons), 'dist/icons is missing entirely');
if (fs.existsSync(srcIcons) && fs.existsSync(distIcons)) {
  for (const set of fs.readdirSync(srcIcons).filter((d) => fs.statSync(path.join(srcIcons, d)).isDirectory())) {
    const srcCount = fs.readdirSync(path.join(srcIcons, set)).filter((f) => f.endsWith('.svg')).length;
    const distSet = path.join(distIcons, set);
    const distCount = fs.existsSync(distSet) ? fs.readdirSync(distSet).filter((f) => f.endsWith('.svg')).length : 0;
    check(distCount === srcCount, `icon set "${set}": src has ${srcCount} svg(s), dist has ${distCount}`);
  }
}

if (failures.length > 0) {
  console.error('dist verification FAILED:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}
console.log('dist verification passed');
