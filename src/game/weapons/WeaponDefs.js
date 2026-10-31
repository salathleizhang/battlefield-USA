/**
 * Weapon catalogue. Stats are per-weapon and drive both the runtime state machine
 * (Weapon.js) and the first-person rig (ViewModel.js).
 *
 * `mode`:
 *   bolt — one shot per bolt cycle (held trigger keeps cycling)
 *   semi — one shot per trigger press
 *   auto — fully automatic
 */
export const WEAPONS = {
  type38: {
    id: 'type38',
    name: '三八大盖',
    fullName: '三八式步枪 · 6.5×50mm',
    kind: '栓动步枪',
    caliber: '6.5mm',
    slot: 'primary',
    model: 'rifle',
    optic: 'irons',
    mode: 'bolt',
    magazine: 5,
    reserve: 60,
    damage: 105,
    headshot: 2.4,
    velocity: 760,
    cycleTime: 0.78,
    reloadTime: 2.55,
    spreadHip: 0.010,
    spreadAds: 0.0011,
    recoil: 0.030,
    meleeDamage: 130,
    zeroRange: 100,
    adsTime: 0.22,
    spreadPerShot: 0.00095,
    spreadMax: 0.0062,
    spreadRecovery: 0.010,
    sprintToFire: 0.24,
    reloadCommit: 0.8,
    mobility: 0.97,
    adsMobility: 0.92,
  },

  m4: {
    id: 'm4',
    name: 'M4A1',
    fullName: 'M4A1 卡宾枪 · 5.56×45mm',
    kind: '突击步枪',
    caliber: '5.56mm',
    slot: 'primary',
    model: 'm4a1',
    optic: 'reddot',
    mode: 'auto',
    magazine: 30,
    reserve: 210,
    damage: 28,
    headshot: 1.5,
    velocity: 880,
    cycleTime: 0.0769,
    reloadTime: 2.1,
    spreadHip: 0.0436,
    spreadAds: 0.00087,
    recoil: 0.0059,
    meleeDamage: 90,
    adsTime: 0.26,
    spreadPerShot: 0.0061,
    spreadMax: 0.0698,
    spreadRecovery: 0.1047,
    sprintToFire: 0.2,
    reloadCommit: 0.8,
    mobility: 0.95,
    adsMobility: 0.82,
  },
  ak: {
    id: 'ak',
    name: 'AK-47',
    fullName: 'AK-47 · 7.62×39mm',
    kind: '突击步枪',
    caliber: '7.62mm',
    slot: 'primary',
    model: 'ak47',
    optic: 'irons',
    mode: 'auto',
    magazine: 30,
    reserve: 180,
    damage: 34,
    headshot: 1.5,
    velocity: 715,
    cycleTime: 0.1,
    reloadTime: 2.3,
    spreadHip: 0.0471,
    spreadAds: 0.00105,
    recoil: 0.0087,
    meleeDamage: 95,
    adsTime: 0.28,
    spreadPerShot: 0.007,
    spreadMax: 0.0785,
    spreadRecovery: 0.096,
    sprintToFire: 0.22,
    reloadCommit: 0.8,
    mobility: 0.93,
    adsMobility: 0.8,
  },
  mp5: {
    id: 'mp5',
    name: 'MP5A5',
    fullName: 'MP5A5 冲锋枪 · 9×19mm',
    kind: '冲锋枪',
    caliber: '9mm',
    slot: 'primary',
    model: 'mp5a5',
    optic: 'reddot',
    mode: 'auto',
    magazine: 30,
    reserve: 240,
    damage: 25,
    headshot: 1.5,
    velocity: 400,
    cycleTime: 0.0706,
    reloadTime: 1.9,
    spreadHip: 0.0349,
    spreadAds: 0.0014,
    recoil: 0.0048,
    meleeDamage: 80,
    adsTime: 0.2,
    spreadPerShot: 0.0044,
    spreadMax: 0.0611,
    spreadRecovery: 0.14,
    sprintToFire: 0.12,
    reloadCommit: 0.8,
    mobility: 1.0,
    adsMobility: 0.88,
  },
  p226: {
    id: 'p226',
    name: 'P226',
    fullName: 'SIG Sauer P226 · 9×19mm',
    kind: '手枪',
    caliber: '9mm',
    slot: 'secondary',
    model: 'p226',
    optic: 'irons',
    mode: 'semi',
    magazine: 15,
    reserve: 90,
    damage: 34,
    headshot: 1.6,
    velocity: 380,
    cycleTime: 0.1429,
    reloadTime: 1.35,
    spreadHip: 0.0262,
    spreadAds: 0.0017,
    recoil: 0.0115,
    meleeDamage: 70,
    adsTime: 0.16,
    spreadPerShot: 0.0105,
    spreadMax: 0.0524,
    spreadRecovery: 0.14,
    sprintToFire: 0.1,
    reloadCommit: 0.78,
    mobility: 1.05,
    adsMobility: 0.98,
  },
  m1911: {
    id: 'm1911',
    name: 'M1911A1',
    fullName: 'M1911A1 · .45 ACP',
    kind: '手枪',
    caliber: '.45',
    slot: 'secondary',
    model: 'm1911',
    optic: 'irons',
    mode: 'semi',
    magazine: 8,
    reserve: 56,
    damage: 42,
    headshot: 1.7,
    velocity: 250,
    cycleTime: 0.1667,
    reloadTime: 1.45,
    spreadHip: 0.0297,
    spreadAds: 0.0021,
    recoil: 0.0145,
    meleeDamage: 70,
    adsTime: 0.17,
    spreadPerShot: 0.0157,
    spreadMax: 0.0611,
    spreadRecovery: 0.122,
    sprintToFire: 0.11,
    reloadCommit: 0.78,
    mobility: 1.04,
    adsMobility: 0.97,
  },
};

/**
 * Attachments (ported from the reference project's table, folded into our stat fields).
 * Each entry lists the slots it may occupy and the multipliers/additions applied on top of
 * the base weapon def by `applyAttachments`.
 */
export const ATTACHMENTS = {
  suppressor: { name: '消音器', slot: 'muzzle', suppressed: true, rangeMul: 0.9, adsAdd: 0.02, recoilMul: 0.92, flashMul: 0.15, volumeMul: 0.45 },
  compensator: { name: '补偿器', slot: 'muzzle', recoilMul: 0.85, flashMul: 1.2 },
  brake: { name: '制退器', slot: 'muzzle', recoilMul: 0.92, hRecoilMul: 0.85, flashMul: 1.4 },
  extmag: { name: '扩容弹匣', slot: 'magazine', magMul: 1.5, reloadAdd: 0.3, adsAdd: 0.03, moveMul: 0.97 },
  fastmag: { name: '快拔弹匣', slot: 'magazine', reloadMul: 0.75 },
  vgrip: { name: '垂直握把', slot: 'underbarrel', recoilMul: 0.88, adsAdd: 0.02 },
  agrip: { name: '斜角握把', slot: 'underbarrel', adsMul: -0.1, spreadMul: 0.92 },
  bipod: { name: '两脚架', slot: 'underbarrel', recoilMul: 0.97, adsAdd: 0.03, moveMul: 0.97, braced: true },
};

const clampNum = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Return a new def with the given attachment ids folded in.
 * Unknown ids and duplicates that share a slot are ignored (first wins).
 */
export function applyAttachments(def, ids = []) {
  const out = { ...def, attachments: [] };
  const slots = new Set();
  for (const id of ids) {
    const a = ATTACHMENTS[id];
    if (!a || slots.has(a.slot)) continue;
    slots.add(a.slot);
    out.attachments.push(id);
    if (a.magMul) out.magazine = Math.round(out.magazine * a.magMul);
    if (a.reloadMul) out.reloadTime *= a.reloadMul;
    if (a.reloadAdd) out.reloadTime += a.reloadAdd;
    if (a.recoilMul) out.recoil *= a.recoilMul;
    if (a.spreadMul) { out.spreadHip *= a.spreadMul; out.spreadAds *= a.spreadMul; }
    if (a.adsAdd) out.adsTime += a.adsAdd;
    if (a.adsMul) out.adsTime *= 1 + a.adsMul;
    if (a.moveMul) { out.mobility *= a.moveMul; out.adsMobility = (out.adsMobility ?? out.mobility) * a.moveMul; }
    if (a.suppressed) out.suppressed = true;
    if (a.braced) out.braced = true;
    if (a.rangeMul) out.velocity *= a.rangeMul;
  }
  out.adsTime = clampNum(out.adsTime, 0.12, 0.6);
  return out;
}

/** The loadout every mission starts with (slot order = weapon switch order). */
export const DEFAULT_LOADOUT = ['m4', 'p226'];

export const weaponDef = (id) => WEAPONS[id] || WEAPONS.type38;
