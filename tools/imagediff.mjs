// Per-pixel gate between two baseline directories.
//
//   node tools/imagediff.mjs --a=shots/base --b=shots/next --tol=0
//
// tol is the per-channel 0-255 delta at or below which a pixel counts as
// unchanged. Exits non-zero when any shot moved, so it can gate a refactor:
// "no visual change" stops being an assertion and becomes a check.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodePng, encodePng } from './png.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const A = resolve(args.a || 'shots/base');
const B = resolve(args.b || 'shots/next');
const TOL = Number(args.tol ?? 0);
const WRITE_DIFF = !!args['write-diff'];

const names = readdirSync(A).filter((f) => f.endsWith('.png')).sort();
const rows = [];
let worst = null;

for (const name of names) {
  const pb = join(B, name);
  if (!existsSync(pb)) { rows.push({ shot: name, status: 'MISSING_IN_B' }); continue; }
  const a = decodePng(readFileSync(join(A, name)));
  const b = decodePng(readFileSync(pb));
  if (a.width !== b.width || a.height !== b.height) {
    rows.push({ shot: name, status: 'SIZE_MISMATCH', a: `${a.width}x${a.height}`, b: `${b.width}x${b.height}` });
    continue;
  }
  const total = a.width * a.height;
  let changed = 0, sum = 0, maxDelta = 0;
  const diff = WRITE_DIFF ? new Uint8Array(total * 4) : null;
  for (let i = 0; i < total * 4; i += 4) {
    const d = Math.max(
      Math.abs(a.data[i] - b.data[i]),
      Math.abs(a.data[i + 1] - b.data[i + 1]),
      Math.abs(a.data[i + 2] - b.data[i + 2]),
    );
    sum += d;
    if (d > maxDelta) maxDelta = d;
    const hot = d > TOL;
    if (hot) changed++;
    if (diff) {
      diff[i] = hot ? 255 : a.data[i] >> 2;
      diff[i + 1] = hot ? 0 : a.data[i + 1] >> 2;
      diff[i + 2] = hot ? 255 : a.data[i + 2] >> 2;
      diff[i + 3] = 255;
    }
  }
  if (diff) {
    mkdirSync(B, { recursive: true });
    writeFileSync(join(B, name.replace('.png', '.diff.png')), encodePng(a.width, a.height, diff));
  }
  const row = { shot: name, changedPct: +((changed / total) * 100).toFixed(4), maxDelta, meanDelta: +(sum / total).toFixed(3) };
  rows.push(row);
  if (!worst || row.changedPct > worst.changedPct) worst = row;
}

const identical = rows.every((r) => r.changedPct === 0);
console.log(JSON.stringify({ a: A, b: B, tol: TOL, identical, worst, rows }, null, 2));
process.exit(identical ? 0 : 1);
