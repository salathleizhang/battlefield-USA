# 战场人声 / 军号

来源：**火山方舟 Seedance 2.5**（`doubao-seedance-2-5-260628`，文生视频，开启原生音频 `generate_audio`）。
生成后用 ffmpeg 抽出音轨、切掉首尾杂音、响度归一到 **-16 LUFS**，再转成 44.1 kHz 单声道 ogg / mp3 / m4a。
冲锋号改用 Bilibili 视频 `BV1KS4y1k7HW`（UP：深夜星空W，13.9 秒）下载后提取的音轨，替换了原来的 Seedance 版本。
骂阵一条的 Seedance 生成结果把“鬼子”念成了“拐子”，因此保留画面、台词改用 Edge TTS（`zh-CN-YunjianNeural`）重录，并叠加爆炸与远处枪声底噪。

| 文件 | 时长 | 内容 | Seedance 任务 |
| --- | --- | --- | --- |
| `charge-crowd` | 6.1 s | 数百人齐声冲锋喊杀：“冲呀！杀呀！” | `cgt-20261031092720-2cpto` |
| `bugle-charge` | 13.7 s | 八路军冲锋号，纯军号独奏，取自 Bilibili `BV1KS4y1k7HW`（UP：深夜星空W） | — |
| `curse-american` | 5.1 s | 士兵怒吼：“美国鬼子，我操你妈！” | 画面 `cgt-20261031103733-of54n`，台词 TTS 重录 |
| `order-kill-americans` | 5.1 s | 指挥员口令：“开始！干死美国佬！” | `cgt-20261031092724-rnrfq` |

## 配套视频

`public/assets/video/sfx/` 下是 Seedance 2.5 生成的 480p 画面（H.264 + AAC）：

- `<name>.mp4`：成片，Seedance 画面 + 归一后的音效，可直接剪进宣传片。
- `<name>-audio.mp4`：只有音轨的 mp4（AAC），用于“音效转 mp4”的交付形式。
- `battle-voices-compilation.mp4`：四条音效按顺序拼成的合集，方便试听。

## 复核

用 ASR（`doubao-seed-2-1-lite`）逐条回听转写：crowd 为“冲呀！杀呀！”，curse 为“美国鬼子，我操你妈！”，
order 为“开始，干死美国佬！”；bugle 无对白，源片为纯军号、几乎无底噪，两段吹奏中间约 0.5 秒停顿。

> 注：`public/assets/video/` 下四张战役循环视频本身没有音轨，无法从中提取声音。
> 冲锋号源片是扩音喇叭转录，带有轻微电子失真与空间扩散感；这是原视频本身的质感，未做降噪处理。

## 游戏内触发

在 `src/core/Audio.js` 里注册为 `voice` 组，`Game.updateBattleVoices()` 负责编排：

- **开局约 0.7 秒**：指挥员口令《开始！干死美国佬！》
- **约 1.9 秒**：八路军冲锋号（13.7 秒，覆盖整个冲锋起步）
- **约 4.8 秒**：集体喊杀《冲呀！杀呀！》（左右各铺一层，拉开声场）
- **约 14.3 秒**：士兵怒骂《美国鬼子，我操你妈！》，作为冲锋遇阻的情绪点
- **之后每次按 Shift + W 发起新的向前冲刺**：有 12–19 秒冷却，随机触发喊杀或骂阵，不会连成循环
