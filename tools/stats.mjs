// Pixel statistics for a directory of shots — the numeric counterpart to
// eyeballing a screenshot. Reports luma percentiles, clipping, saturation and a
// few fixed regions, so "too dark" / "blown out" become numbers that can be
// compared between two builds.
//
//   node tools/stats.mjs shots/base [--regions=sky,bottom]
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decodePng } from './png.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const dir = resolve(process.argv[2] || 'shots/base');
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Fractions of the frame: sky band, upper-third horizon, floor in front. */
const REGIONS = {
  sky: [0.35, 0.02, 0.65, 0.12],
  mid: [0.35, 0.45, 0.65, 0.6],
  floor: [0.35, 0.8, 0.65, 0.95],
  left: [0.02, 0.3, 0.2, 0.7],
  right: [0.8, 0.3, 0.98, 0.7],
};

const files = readdirSync(dir).filter((f) => f.endsWith('.png') && !f.includes('.diff.')).sort();
for (const file of files) {
  const { width: W, height: H, data } = decodePng(readFileSync(join(dir, file)));
  const hist = new Uint32Array(256);
  const n = W * H;
  let sr = 0, sg = 0, sb = 0, sat = 0;
  for (let i = 0; i < n * 4; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    hist[Math.round(lum(r, g, b))]++;
    sr += r; sg += g; sb += b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat += mx > 0 ? (mx - mn) / mx : 0;
  }
  const pct = (p) => {
    let c = 0;
    for (let i = 0; i < 256; i++) { c += hist[i]; if (c >= n * p) return i; }
    return 255;
  };
  const frac = (from, to) => {
    let c = 0;
    for (let i = from; i <= to; i++) c += hist[i];
    return +((c / n) * 100).toFixed(2);
  };
  const regions = [];
  for (const [key, [x0, y0, x1, y1]] of Object.entries(REGIONS)) {
    let rr = 0, gg = 0, bb = 0, cnt = 0;
    for (let y = Math.floor(y0 * H); y < Math.floor(y1 * H); y++) {
      for (let x = Math.floor(x0 * W); x < Math.floor(x1 * W); x++) {
        const i = (y * W + x) * 4;
        rr += data[i]; gg += data[i + 1]; bb += data[i + 2]; cnt++;
      }
    }
    regions.push(`${key}=${Math.round(lum(rr / cnt, gg / cnt, bb / cnt))}`);
  }
  console.log(
    `${file.padEnd(16)} L=${lum(sr / n, sg / n, sb / n).toFixed(1)} ` +
    `p1=${pct(0.01)} p50=${pct(0.5)} p99=${pct(0.99)} max=${pct(0.9999)} ` +
    `clipHi=${frac(250, 255)}% clipLo=${frac(0, 11)}% sat=${((sat / n) * 100).toFixed(1)}% ` +
    regions.join(' '),
  );
}
