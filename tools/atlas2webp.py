#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""atlas2webp — 从 .unitypackage 里直接抽出图集贴图，转成 web 用的 WebP。

包里的贴图是 Unity 侧未压缩的 2048² TIFF（每张 12–16 MB），一共 129 张近 1.3 GB。
这里不把它们落到磁盘：从 tar 流读进内存、解码、缩放、编码成 WebP，只写最终结果。

用法：
    python3 tools/atlas2webp.py <package> <输出目录> Sandbags1 Props3 Wire2 ...
"""

import io
import os
import sys
import tarfile

from PIL import Image

TEX_DIRS = ("Textures1/", "Textures2/")


def build_index(tf):
    """{小写文件名: member} —— 只收 Textures1/2 下的 tif/tga。"""
    idx = {}
    for m in tf.getmembers():
        if "/" not in m.name:
            continue
        guid, kind = m.name.split("/", 1)
        if kind != "pathname":
            continue
        f = tf.extractfile(m)
        if f is None:
            continue
        rel = f.read().decode("utf-8", "replace").split("\n")[0].strip()
        rel = rel.replace("\\", "/").replace("Assets/Military1/", "")
        low = rel.lower()
        if not low.endswith((".tif", ".tga")):
            continue
        if not any(low.startswith(d.lower()) for d in TEX_DIRS):
            continue
        idx.setdefault(os.path.basename(low), (guid, rel))
    return idx


def main(argv):
    if len(argv) < 4:
        sys.exit(__doc__)
    pkg, out, names = argv[1], argv[2], argv[3:]
    size = int(os.environ.get("ATLAS_SIZE", "1024"))
    quality = int(os.environ.get("ATLAS_QUALITY", "85"))
    os.makedirs(out, exist_ok=True)

    tf = tarfile.open(pkg, "r:gz")
    index = build_index(tf)

    # guid -> asset member
    assets = {}
    for m in tf.getmembers():
        if "/" in m.name:
            g, k = m.name.split("/", 1)
            if k == "asset":
                assets.setdefault(g, m)

    total = 0
    missing = []
    for name in names:
        key = name.lower()
        if not key.endswith((".tif", ".tga")):
            key += ".tif"
        hit = index.get(key)
        if not hit:
            missing.append(name)
            continue
        guid, rel = hit
        member = assets.get(guid)
        if member is None:
            missing.append(name)
            continue

        raw = tf.extractfile(member).read()
        with Image.open(io.BytesIO(raw)) as im:
            src = im.size
            im = im.convert("RGB")
            if max(im.size) > size:
                im.thumbnail((size, size), Image.LANCZOS)
            out_name = os.path.splitext(os.path.basename(rel))[0].lower() + ".webp"
            dest = os.path.join(out, out_name)
            im.save(dest, "WEBP", quality=quality, method=6)
        n = os.path.getsize(dest)
        total += n
        print("  %-22s %5dx%-5d -> %4dpx  %7.1f KB" % (
            os.path.basename(rel), src[0], src[1], min(im.size), n / 1024))

    print("\n%d 张，共 %.2f MB → %s" % (len(names) - len(missing), total / 1048576, out))
    if missing:
        print("没找到: " + ", ".join(missing))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
