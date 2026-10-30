# Scene prop assets

Reused from the reference project [cktang88/3d-fps](https://github.com/cktang88/3d-fps)
(`public/assets/models/props/`), converted to web-optimised GLB (or glTF + textures for the two street fixtures) with embedded WebP / compressed JPG textures.
Every model below is Poly Haven **CC0 1.0** — free for commercial use, attribution not required.

| File | Model | Source |
| --- | --- | --- |
| `barrier.glb` | Concrete Road Barrier 02 | [Poly Haven / Amal Kumar](https://polyhaven.com/a/concrete_road_barrier_02) |
| `crate.glb` | Old Military Crate | [Poly Haven](https://polyhaven.com/a/old_military_crate) |
| `crate_wood.glb` | Wooden Crate 02 | [Poly Haven](https://polyhaven.com/a/wooden_crate_02) |
| `barrel.glb` | Barrel 01 | [Poly Haven](https://polyhaven.com/a/barrel_01) |
| `barrel_rust.glb` | Barrel 03 | [Poly Haven / Serhii Khromov](https://polyhaven.com/a/barrel_03) |
| `ammo_box.glb` | Ammo Box | [Poly Haven / DanKit](https://polyhaven.com/a/ammo_box) |
| `jerrycan.glb` | Metal Jerrycan Green | [Poly Haven](https://polyhaven.com/a/metal_jerrycan_green) |
| `fire_hydrant/model.gltf` | Fire Hydrant | [Poly Haven](https://polyhaven.com/a/fire_hydrant) |
| `water_manhole_cover/model.gltf` | Water Manhole Cover | [Poly Haven](https://polyhaven.com/a/water_manhole_cover) |

Changes: renamed to the catalogue keys used by `src/world/Props.js`, rest-scaled to
1940s scene dimensions in code. Textures are the original CC0 maps.

The hydrant and manhole are 1K Poly Haven glTF assets resampled to 512 px and instanced
through the same catalogue; the hydrant is solid, the manhole is a flat decal-like prop.


The stacked sandbag walls are not a GLB: they are rebuilt from the reference project's
lumpy "squashed sphere with a pinched top" bag construction (`Level.sandbags`), using this
project's own canvas PBR material.
