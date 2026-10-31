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
  c96: {
    id: 'c96',
    name: '毛瑟 C96',
    fullName: '毛瑟 C96 驳壳枪 · 7.63×25mm',
    kind: '半自动手枪',
    caliber: '7.63mm',
    slot: 'secondary',
    model: 'pistol',
    mode: 'semi',
    magazine: 10,
    reserve: 50,
    damage: 52,
    headshot: 2.2,
    velocity: 430,
    cycleTime: 0.16,
    reloadTime: 1.95,
    spreadHip: 0.020,
    spreadAds: 0.0042,
    recoil: 0.017,
    meleeDamage: 70,
    zeroRange: 50,
    adsTime: 0.16,
    spreadPerShot: 0.0007,
    spreadMax: 0.004,
    spreadRecovery: 0.014,
    sprintToFire: 0.16,
    reloadCommit: 0.78,
    mobility: 0.99,
    adsMobility: 0.97,
  },
};

/** The loadout every mission starts with (slot order = weapon switch order). */
export const DEFAULT_LOADOUT = ['type38', 'c96'];

export const weaponDef = (id) => WEAPONS[id] || WEAPONS.type38;
