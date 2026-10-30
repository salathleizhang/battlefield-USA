# 战场特效翻书图集（VFX flipbooks）

本目录的三张图集来自 **Unity Labs「Free VFX image sequences & flipbooks」**，
作者在发布页明确以 **CC0 1.0（公共领域）** 授权，可商用、可修改、可再分发，
无需署名；此文件仅用于来源追溯。

| 文件 | 图集 | 用途 |
| --- | --- | --- |
| `wispysmoke02_8x8.webp` | Wispy Smoke 02，8×8（64 帧） | 火焰烟柱、残骸与天际线烟柱 |
| `flame03_16x4.webp` | Flame 03，16×4（64 帧） | 建筑窗口 / 车辆 / 营地火焰 |
| `explosion01_5x5.webp` | Explosion 01，5×5（25 帧） | 手榴弹与远处炮击的火球 |

来源：<https://unity.com/blog/engine-platform/free-vfx-image-sequences-flipbooks>

参考项目中的同名文件位于 <https://github.com/cktang88/3d-fps>（Ironline），
本项目按其 `Ambience` / `Effects` 的用法接入：烟雾走 `render/Particles.js` 的
`LIT` 模式，火焰与爆炸走 `FLIPBOOK` 模式。
