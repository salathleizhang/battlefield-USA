# 战地 · 解放美利坚

> 1947 年，中国远征军跨海反攻美国西海岸。一款运行在浏览器里的大战场第一人称射击游戏。

![status](https://img.shields.io/badge/status-playable%20prototype-b3281d) ![engine](https://img.shields.io/badge/three.js-r186-c9a15a) ![physics](https://img.shields.io/badge/Rapier-0.21-6f7352)

## 这是什么

《战地 · 解放美利坚》是一款以 **20 世纪 40 年代架空历史** 为背景的 Web 3D FPS：

- 你是 **八路军** 远征军的一员，手持 **三八大盖**（三八式步枪）与 **刺刀**。
- 对手是装备 M1 加兰德的美军守备部队。
- 玩法是战地式的 **征服模式**：占领 A / B / C 三个据点，消耗对方兵力票数，先归零者败。
- 四场战役，四张手工搭建的程序化战场：

| # | 战役 | 地点 | 核心场景 |
|---|------|------|----------|
| 01 | 迈阿密海滩登陆战 | 佛罗里达 · 迈阿密海滩 | 大西洋抢滩、鲁姆斯公园、装饰艺术酒店、麦克阿瑟堤道 |
| 02 | 飞夺金门大桥 | 旧金山 · 金门海峡 | 58 米高桥面、双塔、悬索、浓雾 |
| 03 | 强渡密西西比河 | 路易斯安那 · 巴吞鲁日 | 浮桥、河堤战壕、棉花田、河港 |
| 04 | 解放华盛顿 | 华盛顿特区 | 波托马克河、林肯纪念堂、国家广场、国会大厦 |

## 运行

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 生产构建到 dist/
```

## 部署（Cloudflare Pages）

线上地址：<https://battlefield-usa.pages.dev>

站点是纯静态构建（`dist/`），直接跑在 Cloudflare Pages 上：静态请求与流量不限量，素材走 CDN 边缘缓存。

```bash
npx wrangler login   # 首次部署先授权（浏览器 OAuth）
npm run deploy       # 构建 dist/ 并上传到 Pages 生产环境
```

- 项目配置在 [wrangler.toml](wrangler.toml)：`name = "battlefield-usa"`，`pages_build_output_dir = "./dist"`，所以 `npm run deploy` 不需要额外参数。
- 构建产物约 126MB / 519 个文件，最大单文件 6.3MB，都在 Pages 的单文件 25MB、单次 20000 文件限制内。
- [public/_headers](public/_headers) 给 `/assets/*` 加了 1 天强缓存 + `stale-while-revalidate`；`index.html` 保持 `max-age=0` 以便发版立即生效。改素材后又想立刻刷新玩家缓存，就在文件名里带上版本号。
- 只想发预览环境、不影响生产：`npm run deploy:preview`（生成一个以 `preview` 分支为后缀的预览地址）。

推送即部署：`.github/workflows/deploy-pages.yml` 会在 `main` 分支 push 后自动构建并上传。在仓库 Settings → Secrets and variables → Actions 里加两个 secret 即可：

| Secret | 值 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token，权限至少包含 `Account → Cloudflare Pages → Edit` |
| `CLOUDFLARE_ACCOUNT_ID` | 账号 ID（`npx wrangler whoami` 可查） |

## 操作

| 按键 | 动作 |
| --- | --- |
| WASD / 鼠标 | 移动 / 视角 |
| 左键 / 右键 | 射击 / 机瞄 |
| 1 / 2 / 滚轮 | 切换主武器 / 副武器（M4A1 / P226 起） |
| R | 装填（步枪 5 发桥夹 / 手枪 10 发弹匣） |
| V | 刺刀突击 |
| I | 检视武器（转枪展示两侧，开火/瞄准打断） |
| G | 手榴弹 |
| Shift / C / Space | 冲刺 / 蹲下 / 跳跃 |
| Shift ×2 | 战术冲刺（有限时长，冷却恢复） |
| 冲刺中按 C | 滑铲（贴地滑行，坡面加速） |
| 面向矮墙按 Space | 翻越 / 攀爬（落地自动收枪位） |
| Q / E | 掩体探头（左 / 右，贴墙自动收窄） |
| F | 登上 / 离开附近的我方坦克 |
| 车内：W / S · A / D | 油门 / 倒车 · 车体转向 |
| 车内：鼠标 · 左键 | 炮塔与火炮俯仰 · 主炮开火 |
| 车内：右键 · Shift | 炮手瞄准镜 · 并列机枪 |
| Esc | 暂停 |

## 技术栈

- **three.js r186**：渲染、天空、粒子、第一人称武器层（独立 viewScene，避免穿模）。
- **Rapier 0.21**：角色控制器（胶囊 KCC）、地形 trimesh、静态碰撞、射线检测。
- **后处理**：`postprocessing` 6.39（ACES 色调映射、调色、暗角、色差、胶片颗粒、SMAA、CAS 锐化、God Rays、Bloom、镜头脏污）+ `n8ao` 2.0（屏幕空间环境光遮蔽）。武器层作为独立 pass 在 HDR 之后合成，保留自己的 FOV 与光照。
- **史诗感镜头**：在 HDR 阶段给 Bloom 的高光加一层暖色光晕（halation），再用一条独立的半分辨率 pass 做**变形宽银幕横向拉丝**——取 Bloom 第一级阈值为 1.05 的亮部，先密采样横向模糊、再宽采样拉长，叠回画面并染成冷蓝白；太阳、枪口焰、湿反光都会被拉成横线。与原有 God Rays、Bloom、镜头脏污叠加后，四张图的晨光、黄昏与桥塔逆光会明显更像电影定格。设置面板可关（「史诗镜头」）。
- **镜头血溅**：程序化生成两张 1024×576 的血溅贴图（不规则血团、放射状尖刺、飞散血珠、雾状喷溅和重力滴痕），以 alpha 作为覆盖度合成在调色之后；两层贴片各自随机旋转、镜像、缩放、偏移，连续中弹会叠加而不是重画同一张图，血会随时间缓慢向下流淌并褪色。中弹、刺刀命中和阵亡都会触发，重生时清空。设置面板可关（「镜头血溅」）。
- **WebAudio 采样 + 合成混音**：180 个 CC0 音效（真实枪声、拉栓/桥夹、脚步、弹着、爆炸、UI），按距离做空气吸收、延迟、立体声定位与卷积混响；每发枪声再叠一层合成的瞬态与低频冲击，近处和远处听起来不是同一个采样。三八大盖与 M1 加兰德改用各自的实弹录音，不再互相借用 AWM / M24 采样；弹着按混凝土、金属、木材、玻璃、泥土、血肉分层，M1 打空第八发时播放真实的 en-bloc 弹夹 ping，命中与爆头各有独立反馈音。风与浪仍是实时合成。授权见 [audio/CREDITS.md](public/assets/audio/CREDITS.md)。另有 5 条战场人声/军号（集体冲杀、八路军冲锋号、骂阵、进攻口令、电台命令）：开局按“电台命令 → 口令 → 冲锋号 → 喊杀 → 骂阵”铺开，之后每次 Shift+W 向前冲刺还有冷却随机的喊杀/骂阵，见 [audio/voice/README.md](public/assets/audio/voice/README.md)。
- **程序化关卡**：地形高度函数 + 建筑/道具批处理（按材质合并，控制 draw call）。
- **AI**：视锥 + 视线检测、推进/交火/占点状态机、简易避障与涉水规避、重生与目标分配。
- **NPC 武器**：敌人/友军也直接使用参考项目的 FP 枪模型（从 `FP_<id>.glb` 里只取 `Gun_<id>`，按真实枪长归一化后挂到角色模型上，八路军用 AK-47、美军用 M4A1），开枪的枪口位置也随之切到模型自带的 `MuzzleSocket`。
- **步兵动作（迁移自参考项目）**：Quake 式加速/摩擦、战术冲刺与滑铲、翻越/攀爬（含空中自动攀爬）、土狼时间、手动台阶抬升与视线平滑、落地缓冲与坠落伤害、Q/E 掩体探头（射线检测墙面，探头距离自动收窄）、脚步噪音半径供 AI 听觉使用。
- **头部运动曲线（迁移自参考项目）**：`CamCurves.js` 收录 UAL 烘焙的头部轨迹（滑铲起手 / 循环 / 收势、1 米攀爬、落地缓冲），按相机空间叠加位移与俯仰/偏航/翻滚，幅度压到原片段的 ~10–30%，只留下重量感；滑铲与落地各自独立起止，不会互相打断。
- **多武器与配装（直接使用参考项目资产）**：第一人称武器改用 Ironline 的作者级 FP rig（`public/assets/models/fp/*.glb`，枪 + 已摆好的手套手臂，K=2 单位，来源与授权见 [fp/CREDITS.md](public/assets/models/fp/CREDITS.md)），按每把枪 `userData.fp` 里的 hip 框定和实测机械瞄具线解算 ADS，而不是自己建模。可选 M4A1 / AK-47 / MP5A5 / P226 / M1911A1，武器表在 `WeaponDefs.js`（弹匣/备弹/伤害/射速/散布/后坐/开镜时间/机动/开火模式），`?loadout=m4,p226` 指定主副武器；1/2 或滚轮切枪，切枪有出枪时间并取消装填。换弹沿用参考项目的 `ReloadChoreo` 关键帧（枪身内倾、弹匣抽出/拍入、空仓拉栓），并直接驱动模型自带的 `Magazine` / `ChargingHandle` 节点。瞄具用参考项目的 `optics.glb`（红点/全息/3.5×），按模型实测的导轨位置挂载、隐藏折叠机瞄、以瞄具自身的分划锚点解算 ADS 并把 FOV 与灵敏度按倍率缩放；`?optic=acog` 可强制换镜。配件表移植参考项目的 `ATTACHMENTS`（枪口/下挂/弹匣三类，每类互斥），逐项折算到弹匣容量、装填时间、后坐、散布、开镜时间、机动与初速：`?attachments=suppressor,extmag,vgrip` 可组合；消音器同时压低枪声与枪口焰，枪口装置与垂直握把会挂到模型自带的 `MuzzleSocket` / `VGripMount` 节点上。按 I 会播放参考项目的 `INSPECT_RIFLE/PISTOL` 关键帧。高倍镜开镜时切换为**镜筒成像**：圆形视野 + 分划刻度 + 红色箭头，枪身与镜体在满开镜时隐藏（纯 viewmodel 实现，不改后处理链）。三八大盖保留为架空历史配装（`?loadout=type38`）。
- **枪械与弹道（迁移自参考项目）**：真实瞄准角与镜头层分离（子弹只跟 `yaw/pitch`，不吃镜头抖动/摇晃）、逐发后坐轨迹（首发跳、连发爬升、横向漂移）与部分回弹、开火散布膨胀与恢复、开镜过渡时间、冲刺后出枪延迟、装填 80% 提交与取消、子弹重力下坠与距离衰减、近失弹破空声与压制。
- **战术 AI（迁移自参考项目）**：脚步声/枪声听觉调查、压制值（近失弹与中弹）影响精度与射速、反应时间门控首次开火、低血量/换弹/被压制时寻找掩体（胸口中弹线被遮挡、站姿可探头反击）、对失去视野的目标投掷手榴弹、遇到沙袋/木箱等低矮障碍时起跳翻越、出生点评分（避开敌人视线、交火区与刚用过的据点）。
- **AI 难度**：`?difficulty=recruit|regular|hardened|veteran` 切换四档（射击散布、反应时间、开火间隔），默认 `regular`。
- **受击方位提示**：中弹时按弹源在相机空间中的方位，在屏幕环上点亮一段红色弧（6 路独立并发，带白热针尖与向外扩散的辉光），同时叠加全屏红染、暗角加深、色差与降饱和；方向由相机前/右向量投影得到，包含探头、后坐与镜头摇晃，不按 `player.yaw` 近似。爆炸按爆点而不是投掷者定位，坠落伤害只闪红不指方向。弧段用 Canvas 2D 绘制（Chromium 会把 conic-gradient 的 mask 整块丢掉，只剩一个楔形）。
- **AI 寻路（自研，替代参考项目的 Recast/Detour）**：按关卡碰撞体烘焙 2.5–3 m 可行走格 —— 向下射线逐层穿过电缆/雨棚找到落脚面，站姿胶囊测净空，再从出生点与据点洪泛出连通域；A\* 八邻接（禁止斜穿墙角）+ 可走直线简化。目标直线可达或跨连通域时不寻路，直接退回原有转向，所以任何地图都不会因为网格失效而卡死。四张图烘焙耗时约 0.2–0.3 s：华盛顿 51k 格、密西西比 28k、迈阿密 20k、金门 10k。
- **第一人称身体与投影（迁移自参考项目）**：把 bot 用的同一套骨骼角色挂在相机下方，按世界高度逐片元裁掉胸口以上（颜色材质注入 discard，深度材质不动），所以低头能看到自己的腿、腰和胸，而阴影仍然是一整具完整的人形；帽子上的红星是 Sprite、吃不到片元裁剪，单独隐藏。蹲下/滑铲/攀爬时隐藏身体 —— 现用骨骼没有蹲姿，直腿比没有腿更出戏；死亡隐藏、重生恢复。
- **士兵动画分层**：基础移动用 UAL 全身片段，瞄准时再叠一层只含脊柱/双臂/头部的 `aim` 遮罩片段（权重平滑过渡），所以边跑边瞄时上身持枪、下身继续跑；受击与死亡各自触发一次性片段。
- **装甲载具（M46 巴顿）**：车体几何直接取自参考项目 [Claude-of-Tanks](https://github.com/Kevin-Liu-01/Claude-of-Tanks)（MIT）的程序化载具工厂，用 `tools/export-reference-tank.mjs` 导出无贴图 GLB（约 54k 面、五材质槽，meshopt 压缩到 380 KB），保留 `rig_hull / rig_turret / rig_gun / rig_recoil / rig_muzzle` 控制骨架；本项目重涂装、贴识别星并接到自己的物理与战斗层。四张图各有一辆可驾驶的巴顿和至少一辆敌方巴顿/谢尔曼：F 上车，W/S 油门、A/D 车体转向、鼠标转炮塔、左键 90 mm、右键炮手镜、Shift 并列机枪、F 下车。驾驶时采用车尾追尾相机，开镜切到炮塔顶的光学瞄具，视线与炮管共用同一套 `turretYaw/gunPitch`，所以准星指向就是炮弹落点。车体按正面 / 侧面 / 尾部 / 炮塔 / 履带分区，按入射角算等效厚度与跳弹，击穿后按部位伤发动机、履带、炮塔转动；击毁后炮塔歪斜、车体变黑、持续起火冒烟，残骸留在战场上并可再次作为掩体。
- **载具物理**：车体是运动学 Rapier 盒体，四点向下射线采样地形，取平均高度与前后/左右高差得到俯仰和侧倾；前进方向先做车头射线检测，撞墙停车、撞可破坏物按 `0.5·m·v²` 结算冲撞并把墙板打穿，履带碾过木箱、油桶、沙袋时清掉它们的实例与碰撞体。深水会挡车；桥面高于水面时正常通行。引擎声是 WebAudio 合成的柴油机（转速随速度/油门变化），炮声在爆炸采样上叠了炮口爆音与低频体感。
- **可破坏场景**：木箱、油桶、弹药箱、油罐、木板、军械箱等 GLB 道具按实例注册，中弹或爆炸时只把命中的那一个实例缩到零、移除碰撞体，并换成会落地的物理碎片；油桶/弹药/油罐会二次殉爆。建筑不再统一进静态批：墙板按 1.5 m 开间拆成 `InstancedMesh`，每块板一个静态碰撞体；炮弹/火箭按当量打掉 1–3 块墙板，开出真正能看见、能走、能开枪的洞；总血量归零时整栋塌成瓦砾堆（低矮碰撞体，可跨越）、腾起烟尘并起火。坦克可以碾碎道具、撞穿木板墙。

## 美术资产

- **PBR 材质管线**：所有表面使用完整的 albedo / normal / roughness / metalness / AO 贴图组，配合每关一张 HDRI 环境光（PMREM + ACES 色调映射）。清单在 `public/assets/pbr/manifest.json`，素材来源与授权见 [CREDITS.md](public/assets/pbr/CREDITS.md)。
- **全场景材质统一层（unify）**：每个受光材质注入同一段世界空间着色器，做 albedo / 粗糙度归一、共享风化与墙脚积尘、**雨后可湿地面的湿润增亮与镜面积水**（`uWet` / `uRain`），并让四张地图、GLB 道具、棕榈树和程序化建筑落在同一种材质响应里。
- **积水**：材质遮罩在世界噪声低洼处生成镜面水坑，另在海洋大道、金门桥面、国家广场与密西西比河堤手工布置了带不规则 alpha 与天空反射的静水片；水面会接收火焰、太阳与 HDRI 的高光。
- **战场氛围**：火焰（程序化火焰卡片 + Unity Labs 火焰翻书粒子）、翻书烟雾柱、上升余烬、会呼吸的橙红点光源，以及翻书爆炸火球；每关的 `Level.fire()` / `smokeColumn()` 会自动接入这套系统。
- **金门大雾**：`render/Weather.js` 在全局指数雾之上叠出体积感 —— 密度随慢潮汐呼吸，海面三层雾席以不同速度滚动，46 片程序化噪声雾团沿桥轴分布、在桥面与塔高之间漂移。雾同时作为能见度上限参与 AI 视距判定（`env.visibility`），不会出现玩家看不见、AI 却能隔雾点名的情况。
- 当前 14 组材质全部来自 **CC0 1.0** 素材库（ambientCG / Poly Haven）或本项目自制，可商用、可再分发；桥塔改用单生成的国际橙喷涂贴图组 `bridge_orange`。
- **金门大桥为 1:2 结构复刻**：主跨 640 m、桥面净空 33.5 m、塔顶 113.5 m，与真实桥的 1280 / 67 / 227 m 严格同比；双塔为带竖向凹槽与分层收分的 Art Deco 钢塔，塔间 6 道门式横撑，主缆按真实垂度成抛物线并在中跨落到桥面，吊索按 7.6 m 间距成对布置、带索夹，桥面下有 3.8 m 加劲桁架、伸缩缝、六车道标线与 1937 年式路灯。全部构件按材质合批，桥体仍是十余个 draw call。
- 环境按真实海峡重建：北侧马林岬角、南侧旧金山要塞区、西面恶魔岛、雾中锚泊的货轮，以及贴着桥面漂移的体积雾团；能见度压到 120 m 左右，雾同时限制 AI 的索敌距离。
- **换成付费正版资产不需要改代码**：把贴图按 `albedo / normal / roughness / metalness / ao` 五个文件名放进 `public/assets/pbr/<材质名>/`，或在 manifest 里新增条目即可。具体命名映射见 CREDITS.md。
- **第一人称武器改用公版扫描资产**：三八大盖换成 Poly Haven 的 **CC0「Bolt Action Rifle 7.62」**（20k 面、完整 PBR，去掉瞄准镜/枪布/散弹后按 1.275 m 三八式长度归一，枪机 `bolt_a/bolt_b` 重新挂到膛线枢轴，栓动与桥夹动画沿用原锚点）；手榴弹换成 Poly Haven 的 **CC0 木柄手榴弹**。模型与授权见 [weapons/CREDITS.md](public/assets/models/weapons/CREDITS.md)。旧程序化步枪保留为加载失败时的兜底。第一人称瞄准改用枪机上方 28 mm 的觇孔照门 + 准星（扫描件的表尺是折叠状态，无法直接当照门用），枪身、觇孔与准星共用同一条膛线轴，机瞄时不再隐藏枪模。第一人称手臂改用参考项目（Ironline）那套戴手套的蒙皮小臂：拆掉枪只留 68 骨手臂与 3 张贴图，缩放 0.44 后用两骨 IK 贴到枪自身的 `handR`/`handL` 锚点上，前臂滚转按手腕目标朝向分摊到 `Forearm` 与两根 twist 骨，避免袖管拧成麻花；腰射姿态相应收近（0.47 m）并加了 17° 偏转，护木上的左手才在手臂可达范围内。手臂模型为 **CC‑BY 4.0**（DJMaesen / ccransh），署名见 [weapons/CREDITS.md](public/assets/models/weapons/CREDITS.md)。
- 建筑、桥梁、纪念碑、士兵、植被等主体仍为 **程序化建模**；战壕沙袋改为参考项目的「压扁球体 + 收口」堆垛方式（4 层错缝、双层垛），不再是方盒贴图。
- 场景小道具复用参考项目的 **CC0 GLB 模型**：混凝土路障、军用木箱、木条箱、油桶、弹药箱、汽油桶、消防栓、井盖，按实例化批渲染放入四张地图的据点、人行道与补给点，授权与来源见 [props/CREDITS.md](public/assets/models/props/CREDITS.md)。
- **华盛顿国家广场的行道树换成真实 PBR 树**：原先是圆柱 + 低面数球体；现改用 Sketchfab **「Fast Urban Tree」**（gelmi.com.br，**CC BY 4.0**）：9.4 万面游戏级阔叶树，叶片为 alpha 卡而不是扫描碎叶，带 1K 颜色 / alpha / 法线贴图。离线把遮罩烘进 baseColor alpha、转 WebP 并重定原点到树根，最终 GLB 6.2 MB；运行时按 `height: 11` 归一化并以实例化渲染 16 棵，仅树干参与碰撞，实例色相/缩放略有差异。授权与处理步骤见 [nature/CREDITS.md](public/assets/models/nature/CREDITS.md)。
- UI 版式参考 [Ironline](https://github.com/cktang88/3d-fps)：左栏战役导航、半透明战役卡片、圆形小地图与紧凑比分区；视觉改为 **红色警戒 / 共和国之辉** 式的赤红搪瓷 + 黄铜描边军械面板，主按钮为金色斜面，次按钮为暗红钢板。战役卡片使用低透明度玻璃底 + 背景压暗，让战役循环影像从卡片后透出。字体保留自托管的毛笔楷书 **Ma Shan Zheng**（SIL OFL 1.1），按钮与标签改用黑体系统栈；正文为宋体系统字体栈，数字与英文为等宽字体。字体与授权见 `public/fonts/`，不依赖外部字体 CDN。
- **品牌徽记**：由 Seedream 生成的红金圆形军徽 —— 一把锤子镰刀斜插在展翅白头鹰身上，象征远征军的征服；洋红底抠像后导出为透明 PNG（`public/assets/brand/emblem.png`，另导出 64px 的 `favicon.png`），同时用作菜单标识、加载页徽记与站点图标。

## 参考与致谢

- 代码架构参考了 [cktang88/3d-fps](https://github.com/cktang88/3d-fps)（Ironline）的浏览器 FPS 工程实践，包括 Rapier 角色控制器思路、武器层渲染与征服模式结构；其中场景道具（`public/assets/models/props/`）直接复用其 **Poly Haven CC0** 模型，沙袋堆垛方式也来自该项目。
- 第一人称步枪与手榴弹来自 [Poly Haven](https://polyhaven.com/)（CC0 1.0）：[Bolt Action Rifle 7.62](https://polyhaven.com/a/bolt_action_rifle_7_62)（Mateusz Sadek）与 [Stick Grenade](https://polyhaven.com/a/stick_grenade)。其余美术仍为本项目自制或程序化生成，后续替换路径见 [weapons/CREDITS.md](public/assets/models/weapons/CREDITS.md)。
- 湿地面 / 积水 / unify 材质层、后处理链与火焰烟雾系统迁移自 [cktang88/3d-fps](https://github.com/cktang88/3d-fps)（Ironline）的 `Materials.applyUnify`、`Renderer` 与 `world/ambience/*`。其烟雾、火焰、爆炸翻书图集为 **Unity Labs「Free VFX image sequences & flipbooks」**，作者以 **CC0 1.0** 发布；来源与授权见 [vfx/CREDITS.md](public/assets/vfx/CREDITS.md)。
- 音频库（真实枪声 / 拉栓 / 脚步 / 命中 / 爆炸 / UI）来自 [cktang88/3d-fps](https://github.com/cktang88/3d-fps) 的 CC0 音效集：The Free Firearm Sound Library 与 Kenney（CC0 1.0），逐条列在 [audio/CREDITS.md](public/assets/audio/CREDITS.md)。
- 三八大盖的实弹录音取自 [Free Firearm Sound Library](https://github.com/buddingmonkey/FreeFirearmsSFXLibrary) 的 Arisaka 近/中距立体声轨；M1 加兰德枪声、弹夹 ping、血肉/混凝土/金属/木材/玻璃/泥土/水花弹着、命中与爆头反馈、子弹掠过声取自 [Freesound](https://freesound.org/) 的 **CC0 1.0** 条目（Rijam、serøutōnin--deprivəd、BorekPL、craigsmith、qubodup 等），逐条链接同样列在 [audio/CREDITS.md](public/assets/audio/CREDITS.md)。
- 迈阿密海滩的**棕榈树系统**与**敞篷车模型**移植自 [StarKnightt/ocean-drive](https://github.com/StarKnightt/ocean-drive)（MIT）：棕榈部分包括椰子/王棕/菜棕的程序化树干、叶片图集、椰果与风摆着色器，按战役地形重新布置了树列；车辆为 `public/assets/models/miami/convertible.glb`，按停车位重新上色并做了低开销阴影。
- 受击方位提示的交互参考了 [StarKnightt/operation-ironhold](https://github.com/StarKnightt/operation-ironhold)（MIT）：以屏幕环上的红色弧段指示弹源方向，并配合全屏红染与色差；本项目改为 Canvas 2D 的多弧并发实现，方位由相机基向量投影计算。

## 开发进度

- [x] 工程骨架 / 渲染 / 物理 / 输入 / 程序化音频
- [x] 第一人称移动、蹲伏、冲刺、跳跃
- [x] 战术冲刺 / 滑铲 / 翻越攀爬 / Q E 掩体探头 / 落地缓冲与坠落伤害
- [x] 三八大盖：栓动、桥夹装填、机瞄、刺刀、手榴弹、弹道下坠
- [x] 枪械后坐轨迹、散布膨胀、开镜与冲刺出枪手感
- [x] 多武器：槽位切换、独立弹药、半自动扳机、出枪时间
- [x] 美军 AI：感知、交火、占点、重生
- [x] AI 听觉 / 压制 / 掩体 / 投弹
- [x] AI 寻路：可行走网格 + A*（跨连通域/直线可达时退回转向）
- [x] 第一人称身体 + 完整投影（胸口以上片元裁剪，蹲/滑/攀时隐藏）
- [x] 征服模式：三点占领、票数流失、胜负判定
- [x] HUD：罗盘、小地图、击杀播报、占点进度、阵亡界面、受击方位弧
- [x] 战役菜单 / 设置 / 暂停 / 结算
- [x] 四张战役地图
- [x] 后处理管线（N8AO / Bloom / God Rays / 调色 / SMAA）与画质档位
- [x] 湿地面、镜面积水、火焰 / 烟雾 / 余烬 / 翻书爆炸
- [ ] 战役开场演出与任务脚本
- [ ] 载具（登陆艇、吉普、坦克）
- [ ] 更丰富的场景破坏与掩体系统
- [ ] 小队系统、语音、更多武器
