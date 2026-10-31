# Ironline（cktang88/3d-fps）逻辑迁移对照

参考项目：**cktang88/3d-fps**（README 中称 Ironline）。
迁移原则：只迁**游戏逻辑**，不迁 UI；按本仓库的物理/角色/武器架构重写，不整文件照搬。

## 已迁移

| 参考模块 | 迁过来的内容 | 本仓库落点 |
| --- | --- | --- |
| `Player.js` | Quake 式加速/摩擦、战术冲刺（双击 Shift）、冲刺滑铲、翻越/攀爬（含空中自动攀爬）、土狼时间、防连跳衰减、手动台阶抬升、落地缓冲与坠落伤害、Q/E 探头（射线检测墙面自动收窄）、脚步噪音半径 | `src/game/Player.js` |
| `FPCamera.js` | 探头/横移/滑铲翻滚、落地下沉、冲刺与战术冲刺 FOV、头部曲线叠层、步频 bob | `Player.syncCamera` / `_updateCurves` |
| `CamCurves.js` | 滑铲起手/循环/收势、1 m 攀爬、落地缓冲的烘焙头部轨迹 | `src/game/CamCurves.js` |
| `weapons/Recoil.js` | 真实瞄准角与镜头层分离、后坐缓入（~60 ms）、连发不返回、部分回弹、玩家压枪抵扣 | `src/game/AimRecoil.js` |
| `Ballistics.js` | 子弹重力下坠、按距离衰减、近失弹线段判定、压制值传播 | `Game.updateProjectiles` |
| `weapons/Weapon.js` | 散布膨胀与恢复、开镜过渡、冲刺出枪锁、装填 80% 提交、装填取消、逐发后坐轨迹 | `src/game/weapons/Weapon.js` |
| `PlayerBody.js` | 第一人称身体、按世界高度逐片元裁掉胸口以上、完整影子、死亡/蹲伏隐藏 | `src/game/PlayerBody.js` |
| `bots/Bot.js` | 脚步声/枪声听觉、压制影响精度与射速、反应时间门控、掩体选择（胸线遮蔽+可探头）、对失去视野目标投弹、低矮障碍起跳、四档难度 | `src/game/bots/Bot.js` |
| `bots/Navigation.js` | **替代实现**：可行走网格（射线+净空+洪泛连通域）与 A*，不引入 recast wasm | `src/game/bots/NavGrid.js` |
| `Match.js` | 沿用本仓库征服模式；新增参考其 `pickSpawn` 的出生点评分（避视线/交火区/重复点） | `src/game/Match.js` |

## 有意不迁

| 模块 | 原因 |
| --- | --- |
| UI（`ui/HUD.js`、`ui/Menu.js`、`hud.css`） | 需求明确排除；本仓库已有赤红搪瓷风格 UI |
| 多武器 / 配件 / 配装 / 弹匣与枪机状态机 | 会改变"一支三八大盖"的核心设计，需要产品决策 |
| Recast / Detour 导航 | 引入 `@recast-navigation` wasm 依赖；自研网格已覆盖四张图 |
| `render/` 性能系统（Adaptive、Fsr、GpuTimer、Lod、Occlusion、Pvs、ShadowCache、LightPool、UploadRing、Benchmark） | 与本仓库渲染管线差异大，且当前 `Renderer.js` 正在被并行修改 |
| `bots/Character.js` 的程序化姿态细节 | 本仓库用 UAL 片段 + `aim` 遮罩层，方向不同 |
| 音频实现 | 本仓库已有更完整的采样/卷积混响管线 |

## 验证（`?capture=1` 确定性回放，seed=7）

| 项 | 结果 |
| --- | --- |
| Q/E 探头 | `lean = 1.00`，镜头翻滚 −0.209 rad（−12°），松开 30 帧回到 0.01 |
| 滑铲 | 冲刺 6.92 m/s → 滑铲 1 帧内成立，视点降到 1.30 m（目标 0.9 阻尼中） |
| 战术冲刺 | 双击 Shift 后 `tacSprint = true`，8.27 m/s |
| 跳跃 | 峰值 1.05 m |
| 攀爬 | 0.9 m 矮墙 → `climb`，抬升 0.90 m |
| 后坐 | 首发抬升 0.046 rad，90 帧后归零 |
| 弹道 | 20 m 伤害 105；150 m 伤害 94（公式 94.4），需 0.19 m 下坠补偿 |
| 装填 | 80% 提交（2→5 发，备弹 60→57）；提前取消保持 2 发 |
| AI 听觉 | `alertBots` 后敌方 `heardPos` 有值 |
| 压制 | `onSuppressed(1)` → 0.25 |
| 掩体 | 低血量时找到 10.9 m 内掩体点 |
| 投弹 | 电脑人投弹命中，40 hp → 0 |
| 导航 | 迈阿密 18 465 可达格 / 225 ms；254 m 绕障寻路 3 个路点 |
| 第一人称身体 | 可见、`clipY = eye − 0.48`、投影开启 |
| 征服 | 10 s 内票数 320 → 310 / 319（交战与失点） |
