/**
 * Export an authored tank from Kevin-Liu-01/Claude-of-Tanks as a textureless
 * GLB for this project.
 *
 * The reference repo (MIT) builds every vehicle from TypeScript procedural
 * geometry — there are no tank GLB assets to copy. This script imports its
 * factory in Node 24 (native TS stripping), flattens the LODs, merges the
 * visible parts into our five material slots and keeps the control rigs:
 * rig_hull / rig_turret / rig_gun / rig_recoil / rig_muzzle.
 *
 * Usage:
 *   node --experimental-strip-types tools/export-reference-tank.mjs \
 *     /path/to/Claude-of-Tanks m46_patton public/assets/models/vehicles/m46_patton.glb
 *
 * Then compress (optional, recommended):
 *   npx gltfpack -i out.glb -o out.glb -cc -kn
 *
 * The result is re-skinned at runtime by src/vehicles/TankModel.js.
 */
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repoArg, id = 'm46_patton', outArg = 'm46_patton.glb'] = process.argv.slice(2);
if (!repoArg) {
  console.error('usage: node tools/export-reference-tank.mjs <reference-repo> [id] [out.glb]');
  process.exit(1);
}
const repo = path.resolve(repoArg);
// The reference repo resolves `three` from its own node_modules; link ours in.
const localThree = path.resolve('node_modules/three');
if (!fs.existsSync(path.join(repo, 'node_modules/three'))) {
  fs.mkdirSync(path.join(repo, 'node_modules'), { recursive: true });
  try { fs.symlinkSync(localThree, path.join(repo, 'node_modules/three')); } catch { /* exists */ }
}

const { installCanvasFixture } = await import(pathToFileURL(path.join(repo, 'src/vehicles/canvasFixture.test-support.mjs')));
installCanvasFixture();
const { createTank, ensureTankBuilder } = await import(pathToFileURL(path.join(repo, 'src/vehicles/fleetFactory.ts')));
const THREE = await import('three');
const { mergeGeometries } = await import('three/addons/utils/BufferGeometryUtils.js');
const { GLTFExporter } = await import('three/addons/exporters/GLTFExporter.js');

await ensureTankBuilder(id);
const t = createTank(id, null, {
  quality: 'low', proceduralOnly: true, materialMode: 'geometry-only', batchStatic: false, decor: true,
});
t.root.updateMatrixWorld(true);

// Keep the most detailed LOD; drop shadow proxies, interior fills and build gates.
function flatten(obj) {
  for (const child of [...obj.children]) {
    flatten(child);
    if (child.isLOD) {
      const keep = child.levels.find((l) => l.object)?.object;
      if (keep) obj.add(keep);
      obj.remove(child);
    }
  }
}
flatten(t.root);
const drop = [];
t.root.traverse((o) => {
  if (/procShadow|InteriorFill|turretSeatRace|mobileStaticBatch/.test(o.name)) drop.push(o);
  const mm = Array.isArray(o.material) ? o.material[0] : o.material;
  if (o.isMesh && (!o.material || /non-rendering/.test(mm?.name || ''))) drop.push(o);
});
for (const o of drop) o.removeFromParent();

const rigs = ['rig_hull', 'rig_turret', 'rig_gun', 'rig_recoil'];
const rigOf = new Map();
for (const name of rigs) {
  const o = t.root.getObjectByName(name);
  if (o) rigOf.set(o, name);
}

function slotFor(name) {
  if (/glass/i.test(name)) return 'glass';
  if (/rubber|tire/i.test(name)) return 'rubber';
  if (/dark|track|gearEndWheel|gearReturnRoller|gearSuspension|gunMount|Decor_steel|Decor_kit|trackPad/i.test(name)) return 'dark';
  if (/Decor_canvas|Decor_cans|Decor_wood/i.test(name)) return 'accent';
  return 'paint';
}

const buckets = new Map();
const meshes = [];
t.root.traverse((o) => { if (o.isMesh) meshes.push(o); });
const inv = new THREE.Matrix4();
for (const mesh of meshes) {
  let rig = mesh.parent;
  while (rig && !rigOf.has(rig)) rig = rig.parent;
  if (!rig) continue;
  const rigName = rigOf.get(rig);
  const slot = slotFor(mesh.name + ' ' + (mesh.material?.name || ''));
  const rigInv = inv.clone().copy(rig.matrixWorld).invert();
  const push = (geo, matrix) => {
    const c = geo.clone();
    if (!c.index) c.setIndex(Array.from({ length: c.attributes.position.count }, (_, i) => i));
    c.applyMatrix4(new THREE.Matrix4().multiplyMatrices(rigInv, matrix));
    for (const key of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(key)) c.deleteAttribute(key);
    if (!c.attributes.normal) c.computeVertexNormals();
    if (!c.attributes.uv) c.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(c.attributes.position.count * 2), 2));
    const k = rigName + ':' + slot;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(c);
  };
  if (mesh.isInstancedMesh) {
    for (let i = 0; i < mesh.count; i++) {
      const m = new THREE.Matrix4();
      mesh.getMatrixAt(i, m);
      push(mesh.geometry, new THREE.Matrix4().multiplyMatrices(mesh.matrixWorld, m));
    }
  } else {
    push(mesh.geometry, mesh.matrixWorld);
  }
}

for (const mesh of meshes) mesh.removeFromParent();
for (const [key, geos] of buckets) {
  const [rigName, slot] = key.split(':');
  const rig = t.root.getObjectByName(rigName);
  const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  if (!g) continue;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.2 });
  mat.name = 'tank:' + slot;
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'part_' + slot;
  mesh.castShadow = mesh.receiveShadow = true;
  rig.add(mesh);
}

// GLTFExporter's binary path uses FileReader, absent in Node.
globalThis.FileReader = class FileReaderFixture {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.({ target: this }); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(b).toString('base64'); this.onloadend?.({ target: this }); }); }
};
const exporter = new GLTFExporter();
const buf = Buffer.from(await exporter.parseAsync(t.root, { binary: true, onlyVisible: true }));
fs.mkdirSync(path.dirname(outArg), { recursive: true });
fs.writeFileSync(outArg, buf);
console.log(`wrote ${outArg} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`);
