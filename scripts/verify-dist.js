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

// 3. Every icon set in src/icons must reach dist/icons with exactly the same
// files — filename comparison, not just counts, so a swapped or missing icon
// is caught too (guards the webpack CopyPlugin config).
const svgsIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort() : []);
const srcIcons = path.join(ROOT, 'src', 'icons');
const distIcons = path.join(DIST, 'icons');
check(fs.existsSync(distIcons), 'dist/icons is missing entirely');
if (fs.existsSync(srcIcons) && fs.existsSync(distIcons)) {
  for (const set of fs.readdirSync(srcIcons).filter((d) => fs.statSync(path.join(srcIcons, d)).isDirectory())) {
    const srcFiles = svgsIn(path.join(srcIcons, set));
    const distFiles = new Set(svgsIn(path.join(distIcons, set)));
    const missing = srcFiles.filter((f) => !distFiles.has(f));
    check(
      missing.length === 0,
      `icon set "${set}": ${missing.length} svg(s) missing from dist (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', …' : ''})`
    );
    check(
      distFiles.size === srcFiles.length,
      `icon set "${set}": dist has ${distFiles.size} svg(s), src has ${srcFiles.length}`
    );
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
