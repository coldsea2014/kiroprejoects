// TubePilot — crée dans dist/ :
//   tubepilot-<version>.zip         l'extension seule (à envoyer au Chrome Web Store, ou à décompresser puis « Charger l'extension non empaquetée »)
//   tubepilot-<version>-source.zip  le code complet avec tests, outils, documentation et textes des boutiques (CodeCanyon)
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { deflateRawSync, crc32 } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const ALWAYS_SKIP = new Set(['node_modules', 'dist', '.git', '.DS_Store', 'shots']);

function walk(dir, skip, out = []) {
  for (const name of readdirSync(dir)) {
    if (ALWAYS_SKIP.has(name) || skip.has(path.relative(root, path.join(dir, name)))) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, skip, out);
    else out.push(full);
  }
  return out;
}

function zip(files, prefix, out) {
  // date DOS valide (sinon certains décompresseurs affichent 1980 ou refusent)
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const locals = [], centrals = [];
  let offset = 0;
  for (const file of files.sort()) {
    const name = Buffer.from(prefix + path.relative(root, file).split(path.sep).join('/'), 'utf8');
    const data = readFileSync(file);
    const comp = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(dosTime, 10); head.writeUInt16LE(dosDate, 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(comp.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(name.length, 26); head.writeUInt16LE(0, 28);
    locals.push(head, name, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(dosTime, 12); cen.writeUInt16LE(dosDate, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
    centrals.push(cen, name);
    offset += head.length + name.length + comp.length;
  }
  const cenBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10);
  end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, Buffer.concat([...locals, cenBuf, end]));
  console.log('→', path.relative(root, out), `(${centrals.length / 2} fichiers, ${(statSync(out).size / 1024).toFixed(0)} Ko)`);
}

// extension : uniquement ce que Chrome charge (+ docs, ouvertes depuis les réglages)
const extSkip = new Set(['tests', 'tools', 'store', 'package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md', '.gitignore', 'icons/icon.svg']);
zip(walk(root, extSkip), 'tubepilot/', path.join(root, 'dist', `tubepilot-${version}.zip`));
zip(walk(root, new Set()), 'tubepilot-source/', path.join(root, 'dist', `tubepilot-${version}-source.zip`));
