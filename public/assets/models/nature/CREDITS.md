# Nature assets

| File | Model | Author | Source | License |
| --- | --- | --- | --- | --- |
| `tree_urban.glb` | Fast Urban Tree | gelmi.com.br | [Sketchfab](https://sketchfab.com/3d-models/fast-urban-tree-c6c7cebef37544ee8a80780034a03737) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

The source is a game-ready broadleaf with alpha-card foliage (93,622 triangles,
110,930 vertices), downloaded through the project's Sketchfab viewer export.
The shipped GLB is a web derivative:

- baked the viewer's three maps into two glTF materials: an RGBA leaf atlas
  (mask baked into the base-colour alpha channel) and an opaque bark material,
  both sharing one 1K normal map;
- the leaf material keeps `alphaMode: BLEND` and `doubleSided`, so the canopy
  reads as full foliage instead of a cut-out silhouette;
- 1K WebP textures (leaf RGBA 750 KB, normal 399 KB) embedded in a 6.2 MB GLB;
- rebased to the origin (trunk at 0,0,0, ground at y=0) and normalised to metres
  at load time by `Props.js` (`height: 11`).

Attribution: **"Fast Urban Tree" by gelmi.com.br**, licensed under CC BY 4.0.
