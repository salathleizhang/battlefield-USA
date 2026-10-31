# 第一人称武器模型（models/fp/*.glb）来源与授权

这些模型与贴图取自参考项目 **Ironline**（[cktang88/3d-fps](https://github.com/cktang88/3d-fps)）的
`public/assets/models/fp/`，原项目由作者重定向、重新绑定、统一材质并烘焙 AO。

- **除 VSS 为 CC0 外，均为 CC BY 4.0**；本项目按许可要求在此署名。
- 修改方式：重新摆位、重新绑定手臂、缩放、去除厂标、贴图转 WebP、AO 烘焙。
- 共享手臂贴图：`arms_basecolor.webp`、`arms_normal.webp`（与模型同目录）。

## 逐项署名

- 手套手臂：**"Fps arms" by bumstrum (DJMaesen)** — https://sketchfab.com/3d-models/fps-arms-9452ce4cddde4110a4fd73e555a8e412
- 手臂绑定与握持模板 by **ccransh**：
  - "FPS AK-74m animations" — https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14
  - "FPS pistol animations" — https://sketchfab.com/3d-models/fps-pistol-animations-0d7a343dcb6f401197a73c91aee93f6d
  - "FPS animations sniper rifle" — https://sketchfab.com/3d-models/fps-animations-sniper-rifle-c15ae8393d824f5b929e3f69691cdd31
- Remington 870（`shotgun.glb`）：**"FPS Arms remington (shotgun)" by ccransh**，枪身 by tris09 —
  https://sketchfab.com/3d-models/fps-arms-remington-shotgun-e68ef617fe8a48cca8610d016ffd5881
- M4A1（`m4a1.glb`）：**"M4A1" by Firewarden** — https://sketchfab.com/3d-models/m4a1-40d8ef818c7549a896371cbb1f64fec6
- SCAR-L（`scarl.glb`）：**"FN Scar-L Assault Rifle" by Hitansh_3DArtist** — https://sketchfab.com/3d-models/fn-scar-l-assault-rifle-ea1823de59684fd596d9f6726382f948
- MP5A5（`mp5a5.glb`）：**"MP5 Submachine Gun" by Rotuma** — https://sketchfab.com/3d-models/mp5-submachine-gun-a73b61932a0e4eecb5db5c63c158aa24
- VSS（`vss.glb`）：**"Special Sniper Rifle VSS Vintorez" by ArmsMuseum** — **CC0** —
  https://sketchfab.com/3d-models/special-sniper-rifle-vss-vintorez-4d5d8c1b7b79429abfa4816f18330089
- M24（`m24.glb`）：**"M24 Bounty Hunter Sniper Rifle" by Naudaff3D** — https://sketchfab.com/3d-models/m24-bounty-hunter-sniper-rifle-d40e74e2259549f5b025807163f1028c
- AWM（`awm.glb`）：**"AWM" by erhanmatur** — https://sketchfab.com/3d-models/awm-bacc05ad5c074c9daa3aa7ca02766a6c
- P226（`p226.glb`）：**"Sig Sauer P226" by Alexcanot** — https://sketchfab.com/3d-models/sig-sauer-p226-e3d4f1ab22f342f4a0891743353c114c
- M1911（`m1911.glb`）：**"M1911 pistol" by egorbelous** — https://sketchfab.com/3d-models/m1911-pistol-80a0b8a6c4314da4a7b3a7cfe6cec1d4
- AK-47（`ak47.glb`）：Operation Steel Tide 的 AK 网格（见 Ironline 的 ASSET_SOURCES），重新绑定。

## 未随本仓库分发

参考项目里的瞄具（`optics.glb`）、步枪动画模板（`fp_rifle_anims.json`）尚未引入；本仓库只用了上述枪械 rig 的静态握持姿态。
如后续要接换弹/拉栓动画，需要另行评估这些资产的许可（Fab 素材许可与 CC BY 不同）。
