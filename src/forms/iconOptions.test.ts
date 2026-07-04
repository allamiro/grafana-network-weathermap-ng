// #215: every picker entry must resolve to a bundled SVG and every bundled
// SVG must be selectable — a rename or deletion on either side otherwise
// silently produces broken node icons.
import * as fs from 'fs';
import * as path from 'path';
import { CloudIcons, VendorIcons } from './iconOptions';

const iconDir = (set: string) => path.join(__dirname, '..', 'icons', set);

const setMatchesDisk = (set: string, names: string[]) => {
  const files = fs
    .readdirSync(iconDir(set))
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.replace(/\.svg$/, ''))
    .sort();
  expect([...names].sort()).toEqual(files);
};

test('cloud picker entries match the bundled cloud icons (#215)', () => {
  setMatchesDisk('cloud', CloudIcons);
  expect(CloudIcons.length).toBeGreaterThan(0);
});

test('vendor picker entries match the bundled vendor icons (#190)', () => {
  setMatchesDisk('vendors', VendorIcons);
});
