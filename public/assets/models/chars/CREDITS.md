# Character assets

## Clip source — Ironline Bamen soldier (`v2/soldier.glb`, clips only)

The Bamen *body* is not used by default (`?chars=ironline` swaps it in). Only its animation clips are
used: `src/game/bots/retarget.js` retargets them onto the Quaternius rig at load time, and
`src/game/bots/CharacterLibrary.js` merges the result over the original UAL set (old names win only
where the retarget produces nothing). `?anims=legacy` keeps the original clips for comparison.

Retarget method: world-space rotation relative to each rig's bind pose, with the clips resampled at
30 Hz; limb bones are aimed by bone direction instead of replaying the raw delta, because the two
bind poses differ (Mixamo T-pose vs the Quaternius A-pose). Hips translation is rescaled from the
Bamen rig's centimetres.

## v2 — Ironline Bamen body (`?chars=ironline`)

- `v2/soldier.glb` — **"FREE [Military Soldier] RIGGED" by BAMEN, CC BY 4.0**
  (via [cktang88/3d-fps](https://github.com/cktang88/3d-fps), `public/assets/models/characters/soldier.glb`).
  11 104 tris, 78-bone Mixamo-named rig, six attachment sockets (`WeaponSocket`, `BackWeaponSocket`,
  `HeadSocket`, `VestSocket`, `TeamPatchSocket`, `BackpackSocket`), 50 clips.
  The mesh ships **textureless** (eleven flat-colour materials); the look is rebuilt at runtime by
  `src/game/bots/IronlineLibrary.js` — an object-space triplanar detail tile (twill weave, macro
  blotching, scratches), a dust gradient up the legs, a rest-pose cavity term and per-team uniform
  palettes. That shader is a port of the original project's `Character.js` material system.
- Animation clips — **Quaternius Universal Animation Library, CC0**, retargeted in Blender by the
  Ironline project (`aim_*`, `ready_*`, `crouch_*`, `prone_*`, `slide_*`, `jump_*`, `death`, `hit`,
  `reload`, `shoot`, `throw`, `melee`, `revive`, `mocap_walk_*`). No rifle-specific clips exist in the
  free tier: `aim_idle` is `Pistol_Aim_Neutral` re-posed, `reload`/`shoot` are the pistol versions.

Changes made here: primitives merged into six kit buckets (11 → 6 draw calls), rest-pose attributes
baked for the triplanar shader, team palettes authored for 八路军 (cool blue-grey) and US Army
(olive drab), the Kar98k mounted on a counter-scaled pivot at the grip and oriented along the body's
aim line (the authored `WeaponSocket` sits half a metre off the palm).

Attribution required (CC BY 4.0): credit BAMEN, link the source, state the modifications above.

## v1 — Quaternius / Shadow Six (fallback, `?chars=legacy`)

Source: [jaher/shadow-six](https://github.com/jaher/shadow-six) — assets/characters
(CC0 art; project code MIT). Characters are MPFB/MakeHuman CC0 bodies skinned to the
Quaternius Universal Animation Library (CC0) rig, with embedded albedo/normal/ORM atlases.

- `rifleman_v00.glb`: 八路军底模（德军野战灰军装，换布帽/红星/红袖标并染成灰蓝）
- `greenberet.glb`, `marine.glb`, `sapper.glb`: LOD0/1/2 realistic soldiers
- `commando_anims.glb`: UAL clip library (idle, walk, run, aim, rifle_shoot, reload, die, …)
- `weapons.glb`: weapon props with grip/muzzle sockets (kar98k used by bots)

Changes: team tint, headgear swap, procedural Type 38 stand-in attachment, LOD handling.
