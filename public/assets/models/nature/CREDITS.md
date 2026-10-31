# Nature assets

| File | Model | Source | License |
| --- | --- | --- | --- |
| `tree_small_02.glb` | Tree Small 02 (Burkea africana / wild syringa) | [Poly Haven](https://polyhaven.com/a/tree_small_02) | CC0 1.0 |

The source is Poly Haven's 2.07M-triangle scan collection model, 4.53 m tall. The
shipped GLB is a game-ready derivative:

- baked the branch material's UV set (`TEXCOORD_1` + `KHR_texture_transform`) into
  `TEXCOORD_0`, so the runtime loader only needs one UV channel;
- meshoptimizer simplification to ~84k triangles with foliage kept as real
  geometry (no alpha cards, no transparency sorting);
- foliage material made opaque so it writes depth and casts a correct shadow;
- 1K textures re-encoded as WebP;
- rebased to the origin (trunk at 0,0,0, ground at y=0) and normalised to metres
  at load time by `Props.js` (`height: 11`).

Original textures and model are CC0 1.0; see the Poly Haven page above.
