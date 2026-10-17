// Paket ZIP untuk diunggah ke Chrome Web Store (isi folder dist/).
import { zipSync } from 'fflate';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else files[relative(dist, full).split('\\').join('/')] = readFileSync(full);
  }
};
walk(dist);
const { version } = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const out = new URL(`../workstracker-extension-${version}.zip`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`ZIP dibuat: ${out} (${Object.keys(files).length} file)`);