#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""unpack-unitypackage — 把 .unitypackage 摊成普通文件夹。

.unitypackage 不是私有格式，它就是一个 gzip 压缩的 tar，里面每个资产放在一个
以 GUID 命名的目录中：

    <GUID>/pathname      资产在项目里的相对路径（纯文本，如 Assets/Models/rifle.fbx）
    <GUID>/asset         资产本体（二进制原文件）
    <GUID>/asset.meta    Unity 的导入设置（YAML）
    <GUID>/preview.png   缩略图

所以解包不需要任何逆向手段：解出来的 .fbx / .png / .tga / .wav 就是作者当初
拖进 Unity 的那个原始文件。

用法：
    python3 tools/unpack-unitypackage.py pack.unitypackage
    python3 tools/unpack-unitypackage.py pack.unitypackage -o out/
    python3 tools/unpack-unitypackage.py pack.unitypackage --list
    python3 tools/unpack-unitypackage.py pack.unitypackage --with-meta
"""

import argparse
import collections
import os
import shutil
import sys
import tarfile

KINDS = ("pathname", "asset", "asset.meta", "preview.png")


def normalize(rel):
    """把 pathname 内容整理成干净的相对路径。"""
    rel = rel.replace("\\", "/").strip().strip("\x00")
    # 有些第三方工具重打包时会写成「路径\\n<GUID>」，只取第一行
    if "\n" in rel:
        rel = rel.split("\n", 1)[0].strip()
    while rel.startswith("./"):
        rel = rel[2:]
    return rel.lstrip("/")


def safe_join(root, rel):
    """拼路径，并挡住 ../ 越界。"""
    target = os.path.normpath(os.path.join(root, rel))
    root_n = os.path.normpath(root)
    if target != root_n and not target.startswith(root_n + os.sep):
        raise ValueError("路径越界，拒绝写出: %s" % rel)
    return target


def read_index(tf):
    """扫描 tar 成员，返回 {guid: {kind: member}}。"""
    index = collections.OrderedDict()
    for m in tf.getmembers():
        name = m.name.replace("\\", "/").strip("/")
        if "/" not in name:
            continue
        guid, kind = name.split("/", 1)
        if kind not in KINDS:
            continue
        index.setdefault(guid, {})[kind] = m
    return index


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return ("%.1f %s" % (n, unit)) if unit != "B" else ("%d B" % n)
        n /= 1024.0


def main(argv=None):
    ap = argparse.ArgumentParser(
        description="解开 .unitypackage（其本体是 gzip tar）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("package", help=".unitypackage 文件路径")
    ap.add_argument("-o", "--out", help="输出目录，默认 <包名>_unpacked")
    ap.add_argument("--list", action="store_true", help="只打印清单，不写文件")
    ap.add_argument("--with-meta", action="store_true", help="同时写出 .meta 文件")
    ap.add_argument("--keep-thumbs", action="store_true", help="把缩略图也导到 _previews/")
    args = ap.parse_args(argv)

    src = args.package
    if not os.path.isfile(src):
        sys.exit("找不到文件: %s" % src)

    base = os.path.splitext(os.path.basename(src))[0]
    out = args.out or (base + "_unpacked")

    try:
        tf = tarfile.open(src, "r:*")
    except tarfile.TarError as e:
        sys.exit("这不是能识别的 tar/gzip 包（也许下载不完整）: %s" % e)

    with tf:
        index = read_index(tf)

        # 第一遍：读出所有 pathname，建立 GUID -> 路径 的映射。
        items = []          # (guid, relpath, entry)
        folders = []
        for guid, entry in index.items():
            pm = entry.get("pathname")
            if pm is None:
                continue
            f = tf.extractfile(pm)
            raw = f.read().decode("utf-8", "replace") if f else ""
            rel = normalize(raw)
            if not rel:
                continue
            items.append((guid, rel, entry))
            if "asset" not in entry:
                folders.append(rel)

        items.sort(key=lambda t: t[1].lower())

        if args.list:
            print("%-52s %10s" % ("路径", "大小"))
            print("-" * 64)
            for guid, rel, entry in items:
                am = entry.get("asset")
                size = human(am.size) if am else "(文件夹)"
                print("%-52s %10s" % (rel[:52], size))
            print("-" * 64)
            print("%d 个条目，%d 个文件夹，%d 个文件"
                  % (len(items), len(folders), len(items) - len(folders)))
            return 0

        os.makedirs(out, exist_ok=True)
        written = 0
        total = 0
        written_ext = collections.Counter()
        seen = {}
        skipped = []

        for guid, rel, entry in items:
            try:
                dest = safe_join(out, rel)
            except ValueError as e:
                skipped.append("%s (%s)" % (rel, e))
                continue

            am = entry.get("asset")
            if am is None:
                os.makedirs(dest, exist_ok=True)
                continue
            if rel in seen:
                skipped.append("%s (与 %s 重复)" % (rel, seen[rel][:8]))
                continue
            seen[rel] = guid

            os.makedirs(os.path.dirname(dest), exist_ok=True)
            f = tf.extractfile(am)
            if f is None:
                continue
            with open(dest, "wb") as w:
                shutil.copyfileobj(f, w, 1024 * 1024)
            size = os.path.getsize(dest)
            total += size
            written += 1
            written_ext[os.path.splitext(rel)[1].lower() or "(无扩展名)"] += 1

            if args.with_meta and "asset.meta" in entry:
                mm = tf.extractfile(entry["asset.meta"])
                if mm:
                    with open(dest + ".meta", "wb") as w:
                        shutil.copyfileobj(mm, w)

            if args.keep_thumbs and "preview.png" in entry:
                tm = tf.extractfile(entry["preview.png"])
                if tm:
                    thumb = safe_join(out, os.path.join("_previews", rel + ".png"))
                    os.makedirs(os.path.dirname(thumb), exist_ok=True)
                    with open(thumb, "wb") as w:
                        shutil.copyfileobj(tm, w)

    # 汇总
    print("解包完成: %s" % out)
    print("  文件 %d 个，共 %s" % (written, human(total)))
    if skipped:
        print("  跳过 %d 个条目" % len(skipped))
        for s in skipped[:5]:
            print("    - %s" % s)

    if written_ext:
        print("\n按类型:")
        for ext, n in written_ext.most_common(15):
            print("  %-14s %d" % (ext, n))

    models = [rel for _, rel, e in items
              if "asset" in e and os.path.splitext(rel)[1].lower() in
              (".fbx", ".obj", ".blend", ".dae", ".max", ".ma", ".mb")]
    if models:
        print("\n模型文件（转 GLB 的候选）:")
        for m in models[:20]:
            print("  %s" % m)
        if len(models) > 20:
            print("  ... 还有 %d 个" % (len(models) - 20))

    return 0


if __name__ == "__main__":
    sys.exit(main())
