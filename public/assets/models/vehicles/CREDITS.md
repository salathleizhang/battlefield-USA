# 载具模型来源与授权

## M46 巴顿（`m46_patton.glb`）

- 几何来源：[Kevin-Liu-01/Claude-of-Tanks](https://github.com/Kevin-Liu-01/Claude-of-Tanks) 的程序化载具工厂
  （`src/vehicles/tankFactoryCore.ts`、`src/vehicles/profiles/patton.ts` 等）。
- 本项目用 `tools/export-reference-tank.mjs` 在 Node 里调用对方的 `createTank('m46_patton')`，
  只导出无贴图的几何，按 `paint / dark / rubber / glass / accent` 五个材质槽合并，
  经 `gltfpack -cc` 做 meshopt 压缩后放入本目录。
- 炮塔、火炮、后坐与炮口锚点保留对方控制骨架的节点名：
  `rig_hull` / `rig_turret` / `rig_gun` / `rig_recoil` / `rig_muzzle`。
- 本项目重新赋予材质、涂装、红星/白星识别标、破坏与残骸表现。

## 授权（MIT）

```
MIT License

Copyright (c) 2026 Kevin B. Liu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
