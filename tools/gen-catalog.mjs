/**
 * gen-catalog — 把 fbx2glb 产出的 props.json 变成 Props.js 能吃的道具表。
 *
 * 包里同一个资产常有 LOD0/1/2 三份（车模也这么命名），这里按基名归组只留最精细的一份；
 * 单位混乱的那几个（车、桥、楼）实测是厘米，统一乘 0.01。
 *
 * 用法: node tools/gen-catalog.mjs [--from /tmp/glball] [--out src/world]
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i > 0 ? process.argv[i + 1] : d;
};
const SRC = arg('from', '/tmp/glball');
const OUT = arg('out', 'src');
const DEST = 'public/assets/models/military';

const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'props.json'), 'utf8'));

const baseOf = (n) => n.replace(/_?lod_?\d+$/i, '').replace(/_?lods?\d+$/i, '').toLowerCase();
const SKIP = /^(bridge|building_0[123]|gate|sign_road|sign_stop|wall_sadd|prop_00\d)$/;

const groups = new Map();
for (const name of Object.keys(manifest)) {
  const b = baseOf(name);
  if (!groups.has(b)) groups.set(b, []);
  groups.get(b).push(name);
}

function pick(arr) {
  const exact = arr.find((n) => !/lod/i.test(n));
  if (exact) return exact;
  const l0 = arr.find((n) => /lod_?0*0$/.test(n));
  if (l0) return l0;
  return arr.sort((a, b) => manifest[b].bytes - manifest[a].bytes)[0];
}

/** 名字关键词 → 物理表面类型（脚步声、弹着特效都用得上）。 */
function surfaceOf(name) {
  if (/sandbag/.test(name)) return 'sand';
  if (/wire|fence|cable|pole|lamp|ladder|spool/.test(name)) return 'metal';
  if (/barrel|drum|fuel|container|weapon_?box|ammo|can\b|toilet|trash|locker/.test(name)) return 'metal';
  if (/tent|cammo/.test(name)) return 'sand';
  if (/wall|barrier|brick|building/.test(name)) return 'concrete';
  if (/stone|rock|debris|rubble/.test(name)) return 'rubble';
  if (/plank|pallet|table|chair|bench|wood|shovel|boots/.test(name)) return 'wood';
  if (/garbage|styrofoam|bottle/.test(name)) return 'rubble';
  if (/sign|warning/.test(name)) return 'metal';
  return 'metal';
}

const entries = {};
const copied = [];
for (const [base, arr] of groups) {
  if (SKIP.test(base)) continue;
  const file = pick(arr);
  const info = manifest[file];
  const rawMax = Math.max(...info.size);
  // 车辆/构筑物是厘米单位；迷彩帐篷实测偏大，单独压一档
  const scale = rawMax > 50 ? 0.01 : /^cammo_tent/.test(base) ? 0.55 : 1;
  const maxDim = rawMax * scale;
  entries[base] = {
    file: `military/${file}.glb`,
    surface: surfaceOf(base),
    ...(scale !== 1 ? { scale } : {}),
    solid: maxDim >= 0.55,
  };
  copied.push(file + '.glb');
}

// 只把用到的模型复制进 public，LOD 变体留在临时目录
fs.mkdirSync(DEST, { recursive: true });
for (const f of copied) {
  const src = path.join(SRC, f);
  const dst = path.join(DEST, f);
  if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);
}

const lines = Object.keys(entries).sort().map((k) => {
  const e = entries[k];
  const bits = [`file: '${e.file}'`, `surface: '${e.surface}'`];
  if (e.scale) bits.push(`scale: ${e.scale}`);
  if (!e.solid) bits.push('solid: false');
  return `  ${/^[a-z_][a-z0-9_]*$/.test(k) ? k : `'${k}'`}: { ${bits.join(', ')} },`;
});

const body = `/**
 * 军用道具包（Military Pack Part1）的完整道具表 —— 由 tools/gen-catalog.mjs 生成，别手改。
 *
 * 同一资产的 LOD0/1/2 已按基名合并，只留最精细的一份；车与构筑物原始单位是厘米，
 * 这里已经换算成米。solid 为 false 的是碎石子一类，不值得给碰撞体。
 */
export const MILITARY_PROPS = {
${lines.join('\n')}
};
`;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'militaryProps.js'), body);
console.log(`道具 ${Object.keys(entries).length} 个，复制 ${copied.length} 个 GLB → ${DEST}`);
console.log(`目录文件 → ${path.join(OUT, 'militaryProps.js')}`);
