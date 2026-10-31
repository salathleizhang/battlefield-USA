# Audio assets

All files are **CC0 1.0** and redistributable, except the AI-generated `voice/` set described at the bottom.

## Weapon reports and handling

- **Type 38 Arisaka** — The Free Firearm Sound Library (Ben Jaszczak), CC0:
  https://github.com/buddingmonkey/FreeFirearmsSFXLibrary
  Master tracks `E_18` / `E_25` (near and mid distance, forward/back stereo pairs) and
  their prepared versions. The two channels are close-miked from opposite sides of the
  rifle and partially out of phase, so `src/core/Audio.js` keeps one channel instead of
  summing them.
- **M1 Garand report** — Freesound #385785, “Rifle Shot (M1 Garand)” by **Rijam**, CC0:
  https://freesound.org/people/Rijam/sounds/385785/
- **M1 Garand en-bloc clip ping** — Freesound #725398, “An M1 Garand clip being ejected
  w/ ping” by **serøutōnin--deprivəd**, CC0:
  https://freesound.org/people/ser%C3%B8ut%C5%8Dnin--depriv%C9%99d/sounds/725398/
- Bolt/charger foley, shell handling, footsteps and explosions — The Free Firearm Sound
  Library and **Kenney Impact Sounds / Interface Sounds** (CC0, https://kenney.nl), copied
  from the reference project `cktang88/3d-fps`.

## Bullet impacts and feedback

All from Freesound, **CC0 1.0**:

| Use | Sound | Author |
| --- | --- | --- |
| Flesh / gore | [#423301](https://freesound.org/s/423301/), [#452155](https://freesound.org/s/452155/) | u1769092, bananplyte |
| Concrete | [#161001](https://freesound.org/s/161001/) | deleted_user_1371021 |
| Metal / car | [#399550](https://freesound.org/s/399550/) | BorekPL |
| Wood | [#547414](https://freesound.org/s/547414/), [#319226](https://freesound.org/s/319226/) | Ian_G, worthahep88 |
| Glass | [#560768](https://freesound.org/s/560768/), [#565182](https://freesound.org/s/565182/) | Bricklover, BlondPanda |
| Dirt / ground | [#789388](https://freesound.org/s/789388/), [#319229](https://freesound.org/s/319229/) | modusmogulus, worthahep88 |
| Water | [#675947](https://freesound.org/s/675947/) | craigsmith |
| Hitmarker | [#570335](https://freesound.org/s/570335/), [#322640](https://freesound.org/s/322640/) | User391915396, aruscio28 |
| Bullet whiz | [#855248](https://freesound.org/s/855248/), [#496509](https://freesound.org/s/496509/) | qubodup, TheLittleCrow |

The Freesound entries were taken from the public HQ preview stream and re-encoded to Ogg
Vorbis (`-q:a 9`); the recordings themselves are released CC0, so no permission or
share-alike obligation applies. Files were trimmed at the impact transient, peak-normalised
and, where a stereo pair was out of phase, reduced to the stronger channel before encoding.

All samples are played through the mixer in `src/core/Audio.js`; a small procedural
synthesiser still layers the transient and low punch on top of every gunshot so near/far
reports read differently.

## AI 生成人声 / 军号（2026-10）

- `voice/charge-crowd`、`voice/bugle-charge`、`voice/curse-american`、`voice/order-kill-americans`
  由 **豆包 Seedance 2.5**（`doubao-seedance-2-5-260628`，火山方舟）文生视频并原生生成音频，
  用 ffmpeg 提取音轨并归一到 -16 LUFS；提示词与任务号见 `voice/README.md`。
  其中 `voice/curse-american` 的台词使用 Microsoft Edge TTS（`zh-CN-YunjianNeural`）重录；`voice/bugle-charge` 改用 Bilibili 视频 [BV1KS4y1k7HW](https://www.bilibili.com/video/BV1KS4y1k7HW/)（UP：深夜星空W）的音轨替换，版权归原 UP 主，仅按用户要求在本项目内使用。
  仅限本项目使用，不再以 CC0 名义对外再分发。
