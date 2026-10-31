# Weapon assets

The scanned weapons are **CC0 1.0** (public domain). The first-person arms are **CC-BY 4.0**
and require the attribution below. Everything may be used commercially.

| File | Asset | Author | Source |
| --- | --- | --- | --- |
| `rifle_7_62/model.gltf` | Bolt Action Rifle 7.62 | Mateusz Sadek | [Poly Haven](https://polyhaven.com/a/bolt_action_rifle_7_62) |
| `stick_grenade/model.gltf` | Stick Grenade (Stielhandgranate 24) | Poly Haven | [Poly Haven](https://polyhaven.com/a/stick_grenade) |
| `fp_arms.glb` | First-person gloved arms (CC-BY 4.0) | DJMaesen / bumstrum, rig by ccransh | [Sketchfab](https://sketchfab.com/3d-models/e3c42c05b22944e5839deb8e003f0987), via [cktang88/3d-fps](https://github.com/cktang88/3d-fps) |

## How they are used

- **Rifle** — `src/game/weapons/Type38.js` treats the raw glTF as the first-person
  Type 38 presentation. It removes the source scope, stock wrap and loose cartridge,
  normalises the bore onto −Z, scales it to the real 1.275 m Type 38 length and puts the
  origin on the rear-sight notch so hip/ADS poses share one convention. The authored
  `bolt_a` / `bolt_b` nodes are re-parented to a bore pivot for the cycling animation.
  The old procedural rifle remains as the fallback when the asset cannot be fetched.
- **Grenade** — `Game.throwGrenade` clones the raw scene for the thrown stick grenade
  and keeps a sphere fallback. The model is already 0.38 m long, so it is used at 1:1.

The textures are the original 1K Poly Haven JPGs (albedo + OpenGL normal + packed
metalness/roughness/AO), loaded through the engine's glTF pipeline.

## Replacing them

Both are plain glTF 2.0 with external `.bin` + `textures/`. Drop in any rigged/static
glTF with the same root names, or change the two paths in
`src/game/weapons/RifleModel.js` and `src/game/Game.js`. The rifle's normalisation
constants live at the top of `src/game/weapons/Type38.js`.

## First-person arms

`fp_arms.glb` is the arm mesh and skeleton lifted from the reference project's
`fp/m4a1.glb` (gun, gun textures and the extra markers stripped out with gltf-transform,
so 1.07 MB of arms, skin and 3 textures remain). It is authored at twice real scale, so
`FpHands` runs it at 0.44 and drives a two-bone IK onto the rifle's own `handR` / `handL`
anchors — the same anchors the procedural hands and the bolt/reload motion use. The
forearm's world roll is solved against the grip frame and split across
`Forearm` + `BoneTwist_03/02`, which is what keeps the sleeve from candy-wrapping.

## Iron sights and hands

The scanned Mosin's tangent leaf is folded flat, so the rig carries its own sight set
built in `src/game/weapons/Type38.js`: a 23 mm ghost-ring aperture on the receiver and a
matching post 0.60 m ahead, both on the bore axis defined by the rifle's own rear-sight
line. The Type 30 bayonet is procedural and lives in the same gun-space frame as the
bolt; the gloved hand stubs on the gun remain as the fallback before the skinned arms
finish streaming in.
