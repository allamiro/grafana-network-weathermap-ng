// Guards for plugin metadata that has broken real installs: files a bundle
// test never exercises, so they are checked as files.
import fs from 'fs';
import path from 'path';
import pluginJson from './plugin.json';

const repoRoot = path.join(__dirname, '..');

const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });

// #41: built-in node icons were loaded from public/plugins/knightss27-weathermap-panel/,
// the original plugin's id, so every built-in icon 404'd after the rename.
// Any asset path the code builds must use this plugin's id.
test('asset paths use the plugin id from plugin.json (#41)', () => {
  const wrongIds: string[] = [];
  for (const file of sourceFiles(__dirname)) {
    for (const [, id] of fs.readFileSync(file, 'utf8').matchAll(/public\/plugins\/([\w-]+)\//g)) {
      if (id !== pluginJson.id) {
        wrongIds.push(`${path.relative(repoRoot, file)}: ${id}`);
      }
    }
  }
  expect(wrongIds).toEqual([]);
});

// grafanaDependency was once >=12.0.0 while the plugin supported 11, which
// hid it from every Grafana 11 install. The API compatibility workflow checks
// a list of Grafana versions; the oldest one checked must be exactly the
// minimum the plugin declares, so neither can drift without the other.
test('grafanaDependency matches the oldest Grafana version CI checks', () => {
  const declared = pluginJson.dependencies.grafanaDependency.match(/^>=(\d+\.\d+\.\d+)$/)?.[1];
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/compatibility.yml'), 'utf8');
  const matrix = workflow.match(/grafana-version:\s*\[([^\]]+)\]/)?.[1];
  const checked = (matrix ?? '').split(',').map((v) => v.trim().replace(/['"]/g, ''));
  const byVersion = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

  expect(declared).toBeDefined();
  expect(checked.length).toBeGreaterThan(0);
  expect([...checked].sort(byVersion)[0]).toBe(declared);
});
