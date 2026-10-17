#!/usr/bin/env python3
"""Inspect a .glb file without opening Blender (uses only the Python standard library)

Usage:  python3 tools/inspect_glb.py assets/ninja.glb

Shows: mesh/triangle count, skeleton (joint names + hierarchy),
       animation names + duration, textures (size/type), approximate height
You can paste the output straight into docs/BONES.md
"""
import json, struct, sys


def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF":
        sys.exit("Not a .glb file (if it's .gltf, re-export as GLB Binary)")
    off, js, binchunk = 12, None, b""
    while off < len(data):
        clen, ctype = struct.unpack_from("<II", data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            binchunk = chunk
        off += 8 + clen
    return js, binchunk, len(data)


def image_info(js, binchunk, img):
    mime = img.get("mimeType", "?")
    if "bufferView" not in img:
        return mime, None, None
    bv = js["bufferViews"][img["bufferView"]]
    start = bv.get("byteOffset", 0)
    raw = binchunk[start:start + bv["byteLength"]]
    w = h = None
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", raw[16:24])
    elif raw[:2] == b"\xff\xd8":
        i = 2
        while i < len(raw) - 9:
            if raw[i] != 0xFF:
                i += 1
                continue
            m = raw[i + 1]
            if m in (0xC0, 0xC1, 0xC2):
                h, w = struct.unpack(">HH", raw[i + 5:i + 9])
                break
            i += 2 + struct.unpack(">H", raw[i + 2:i + 4])[0]
    return mime, (w, h), bv["byteLength"]


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    js, binchunk, size = read_glb(sys.argv[1])
    nodes = js.get("nodes", [])
    acc = js.get("accessors", [])
    print(f"file: {sys.argv[1]}  ({size/1024/1024:.2f} MB)")
    print(f"generator: {js.get('asset', {}).get('generator', '?')}")

    tris, verts, ymin, ymax = 0, 0, 1e9, -1e9
    for m in js.get("meshes", []):
        for p in m.get("primitives", []):
            if p.get("mode", 4) != 4:
                continue
            pos = acc[p["attributes"]["POSITION"]]
            verts += pos["count"]
            tris += (acc[p["indices"]]["count"] if "indices" in p else pos["count"]) // 3
            if "min" in pos:
                ymin, ymax = min(ymin, pos["min"][1]), max(ymax, pos["max"][1])
    print(f"\nmeshes: {len(js.get('meshes', []))}  triangles: {tris:,}  vertices: {verts:,}")
    if ymax > ymin:
        print(f"mesh Y-axis height (approximate, before node scale is applied): {ymax - ymin:.3f}")

    skins = js.get("skins", [])
    print(f"\nskins: {len(skins)}")
    for si, s in enumerate(skins):
        names = [nodes[j].get("name", f"node{j}") for j in s["joints"]]
        print(f"  skin {si}: {len(names)} joints")
        for n in names:
            print(f"    - {n}")

    # node hierarchy
    children = {i: n.get("children", []) for i, n in enumerate(nodes)}
    child_set = {c for cs in children.values() for c in cs}
    roots = [i for i in range(len(nodes)) if i not in child_set]
    joint_set = {j for s in skins for j in s["joints"]}

    def show(i, depth):
        n = nodes[i]
        tag = " [bone]" if i in joint_set else ""
        extra = ""
        if "scale" in n:
            extra += f" scale={n['scale']}"
        if "mesh" in n:
            extra += " (mesh)"
        print("  " * depth + f"{n.get('name', f'node{i}')}{tag}{extra}")
        if depth < 12:
            for c in children[i]:
                show(c, depth + 1)

    print("\nnode hierarchy:")
    for r in roots:
        show(r, 1)

    anims = js.get("animations", [])
    print(f"\nanimations: {len(anims)}")
    for a in anims:
        dur = max((acc[s["input"]].get("max", [0])[0] for s in a["samplers"]), default=0)
        print(f"  - {a.get('name', '(unnamed)')}  {dur:.2f}s")

    imgs = js.get("images", [])
    print(f"\ntextures/images: {len(imgs)}")
    for im in imgs:
        mime, dims, nbytes = image_info(js, binchunk, im)
        d = f"{dims[0]}x{dims[1]}" if dims and dims[0] else "?"
        kb = f"{nbytes/1024:.0f} KB" if nbytes else ""
        print(f"  - {im.get('name', '(unnamed)')}  {mime}  {d}  {kb}")


if __name__ == "__main__":
    main()
