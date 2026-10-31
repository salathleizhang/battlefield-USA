/**
 * fbx2glb — 把 Unity 资产包里的 FBX 转成 web 用的 GLB。
 *
 * 只保留几何：位置 / 法线 / UV。贴图不进 GLB —— 这套包是按图集（atlas）做的，
 * 几十个道具共用一张 4K TIFF，逐模型内嵌会重复几十份。转换结果里记下每个模型
 * 用的是哪张图集，运行时由 Props.js 按图集建一个材质共享。
 *
 * 用法：
 *   node tools/fbx2glb.mjs --in /tmp/milall/Models --out public/assets/models/military
 */

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// GLTFExporter 用 Blob + FileReader 拼 GLB 二进制块，Node 里没有 FileReader。
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
};

// FBX 里的贴图是 Unity 侧的 tif，这里根本不去读它：TextureLoader 直接返回空贴图，
// 我们只取它的文件名当作「这个模型属于哪张图集」的线索。
THREE.TextureLoader.prototype.load = function (url) {
  const t = new THREE.Texture();
  // FBXLoader 随后会用 attrName（file14 这种节点名）覆盖 texture.name，
  // 所以真实文件名要自己记下来。
  t.userData = { atlas: path.basename(String(url).replace(/\\/g, '/')).toLowerCase() };
  return t;
};

function parseArgs(argv) {
  const out = { in: null, out: null, only: null, scale: 1, index: 'props.json' };
  for (let i = 2; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    out[k] = argv[i + 1];
  }
  if (!out.in || !out.out) {
    console.error('用法: node tools/fbx2glb.mjs --in <FBX 目录> --out <输出目录> [--only a,b,c]');
    process.exit(1);
  }
  if (out.only) out.only = new Set(out.only.split(',').map((s) => s.trim().toLowerCase()));
  return out;
}

/** 把 FBX 场景烘成一个几何体：烘焙世界变换、去掉蒙皮等属性。 */
function bakeGeometry(root) {
  root.updateMatrixWorld(true);
  const buckets = new Map(); // atlas -> geometries[]
  const stats = { meshes: 0, tris: 0, atlas: null };

  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    stats.meshes += 1;
    let geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
    for (const key of Object.keys(geo.attributes)) {
      if (!['position', 'normal', 'uv'].includes(key)) geo.deleteAttribute(key);
    }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.uv) {
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    }
    if (!geo.index) {
      // 合并时索引与非索引不能混用
      const idx = new Uint32Array(geo.attributes.position.count);
      for (let i = 0; i < idx.length; i++) idx[i] = i;
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
    }

    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    const atlas = mat?.map?.userData?.atlas || null;
    if (atlas) stats.atlas = stats.atlas || atlas;

    const key = atlas || '-';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(geo);
    stats.tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  });

  if (!buckets.size) return null;
  const parts = [];
  for (const [atlas, geos] of buckets) {
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (merged) parts.push({ atlas: atlas === '-' ? null : atlas, geo: merged });
  }
  return { parts, stats };
}

function measure(object) {
  const bb = new THREE.Box3().setFromObject(object);
  const size = bb.getSize(new THREE.Vector3());
  return { size: [size.x, size.y, size.z].map((n) => +n.toFixed(3)), min: bb.min.toArray().map((n) => +n.toFixed(3)) };
}

function exportGLB(object) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(object, (glb) => resolve(Buffer.from(glb)), reject, { binary: true });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.out, { recursive: true });

  const files = fs.readdirSync(args.in).filter((f) => /\.fbx$/i.test(f)).sort();
  const manifest = {};
  let done = 0, failed = [];

  for (const file of files) {
    const name = path.basename(file, path.extname(file)).toLowerCase();
    if (args.only && !args.only.has(name)) continue;

    const buf = fs.readFileSync(path.join(args.in, file));
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

    let baked;
    try {
      baked = bakeGeometry(new FBXLoader().parse(ab, ''));
    } catch (e) {
      failed.push(`${file}: ${e.message}`);
      continue;
    }
    if (!baked) { failed.push(`${file}: 没有网格`); continue; }

    // 每种图集导出成一个节点，运行时就近建材质
    const root = new THREE.Group();
    root.name = name;
    for (const part of baked.parts) {
      const mesh = new THREE.Mesh(part.geo, new THREE.MeshStandardMaterial({ color: 0xffffff }));
      mesh.name = part.atlas || 'default';
      mesh.userData.atlas = part.atlas;
      root.add(mesh);
    }

    const glb = await exportGLB(root);
    const outFile = `${name}.glb`;
    fs.writeFileSync(path.join(args.out, outFile), glb);

    const m = measure(root);
    manifest[name] = {
      file: outFile,
      atlas: baked.parts[0]?.atlas || null,
      atlases: baked.parts.map((p) => p.atlas).filter(Boolean),
      size: m.size,
      min: m.min,
      tris: Math.round(baked.stats.tris),
      bytes: glb.length,
    };
    done += 1;
    console.log(
      `  ${name.padEnd(26)} ${String(Math.round(baked.stats.tris)).padStart(5)} tris  ` +
      `${m.size.map((n) => n.toFixed(2)).join(' x ').padEnd(20)} ${(glb.length / 1024).toFixed(0)} KB  ${path.basename(baked.parts[0]?.atlas || '-')}`
    );
  }

  const indexPath = path.join(args.out, args.index);
  fs.writeFileSync(indexPath, JSON.stringify(manifest, null, 2));
  const total = Object.values(manifest).reduce((a, b) => a + b.bytes, 0);
  console.log(`\n完成 ${done} 个模型，共 ${(total / 1024 / 1024).toFixed(2)} MB → ${indexPath}`);
  if (failed.length) {
    console.log(`失败 ${failed.length} 个:`);
    for (const f of failed.slice(0, 10)) console.log('  ' + f);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
