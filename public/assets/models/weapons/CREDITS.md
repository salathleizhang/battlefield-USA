# Weapon assets

All models in this folder are **CC0 1.0** (public domain) and may be used commercially
and redistributed without attribution. Attribution is recorded here for provenance.

| File | Asset | Author | Source |
| --- | --- | --- | --- |
| `rifle_7_62/model.gltf` | Bolt Action Rifle 7.62 | Mateusz Sadek | [Poly Haven](https://polyhaven.com/a/bolt_action_rifle_7_62) |
| `stick_grenade/model.gltf` | Stick Grenade (Stielhandgranate 24) | Poly Haven | [Poly Haven](https://polyhaven.com/a/stick_grenade) |

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
