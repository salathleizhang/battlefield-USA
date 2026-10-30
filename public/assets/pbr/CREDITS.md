# PBR 材质库

本项目所有表面材质都走 `public/assets/pbr/manifest.json` 这一份清单。清单里的每个
条目对应一个文件夹，文件夹内是五个与引擎无关的标准贴图：

```
bridge_paint/
  albedo.jpg      sRGB 基础色
  normal.jpg      OpenGL 法线（Y+）
  roughness.jpg   粗糙度（灰度）
  metalness.jpg   金属度（灰度，可缺省）
  ao.jpg          环境光遮蔽（灰度，可缺省）
```

缺省的贴图会被自动跳过，不会报错；`roughness` / `metalness` 缺省时按 1 / 0 处理。

## 换成你自己的正版资产

1. 在 `public/assets/pbr/` 下新建或覆盖一个文件夹，例如 `bridge_paint/`。
2. 把买到的贴图按上表重命名放进去。Unreal / Unity 商城的贴图通常叫：
   - `_BaseColor` / `_Albedo` / `_Diffuse` → `albedo.jpg`
   - `_Normal` / `_NormalGL` → `normal.jpg`（DX 法线需要在图像工具里翻转绿通道）
   - `_Roughness` → `roughness.jpg`
   - `_Metallic` / `_Metalness` → `metalness.jpg`
   - `_AO` / `_AmbientOcclusion` → `ao.jpg`
3. 如果贴图的物理尺寸不同，改 `manifest.json` 里该条目的 `tile`（单位：米，一张贴图覆盖的边长）。
4. 刷新页面即可，无需改代码。

`tile` 会结合批处理器的 UV 比例（0.28 UV/米）自动换算 `repeat`，所以同一张 2 米贴图
贴到 6.5 米宽的桥塔和 24 米宽的桥面上，纹理密度是一致的。

## 当前素材来源（全部 CC0 1.0，可商用、可再分发）

| 用途 | 资产 | 来源 |
| --- | --- | --- |
| 桥塔国际橙涂装 | Painted Metal 008（色相调向 #C0362C） | [ambientCG](https://ambientcg.com/view?id=PaintedMetal008) |
| 结构钢板 / 桥面梁 | Metal Plates 013 | [ambientCG](https://ambientcg.com/view?id=MetalPlates013) |
| 混凝土（桥面、人行道） | Concrete 042 A | [ambientCG](https://ambientcg.com/view?id=Concrete042A) |
| 沥青路面 | Road 013 A | [ambientCG](https://ambientcg.com/view?id=Road013A) |
| 地表植被 | Ground 037 | [ambientCG](https://ambientcg.com/view?id=Ground037) |
| 木材 / 弹药箱 | Wood 080 | [ambientCG](https://ambientcg.com/view?id=Wood080) |
| 锈蚀金属 / 残骸 | Metal 041 B | [ambientCG](https://ambientcg.com/view?id=Metal041B) |
| 帆布 / 沙袋 / 军服 | Fabric 066 | [ambientCG](https://ambientcg.com/view?id=Fabric066) |
| 砖墙 | Bricks 105 | [ambientCG](https://ambientcg.com/view?id=Bricks105) |
| 瓦屋顶 | Roofing Tiles 014 B | [ambientCG](https://ambientcg.com/view?id=RoofingTiles014B) |
| 灰泥墙面 | Plaster 002 | [ambientCG](https://ambientcg.com/view?id=Plaster002) |
| 沙滩 | Ground 080 | [ambientCG](https://ambientcg.com/view?id=Ground080) |
| 瓦砾地面 | Ground 111 | [ambientCG](https://ambientcg.com/view?id=Ground111) |
| 金门大桥环境光 | Kloofendal Overcast (Pure Sky) 1K HDR | [Poly Haven](https://polyhaven.com/a/kloofendal_overcast_puresky) |

ambientCG 与 Poly Haven 的素材均为 CC0 1.0（公共领域），无需署名；此表用于追溯来源。
`bridge_paint/albedo.jpg` 在原图上做了色相偏移与压平处理，以匹配金门大桥的 International Orange。
