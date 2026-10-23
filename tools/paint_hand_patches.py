"""Paint two flat patches (fingerless-glove cloth, bare skin) into free areas of the raw Meshy atlas, for the rebuilt hands.
usage: python3 paint_hand_patches.py RAW.glb OUT_DIR
Writes OUT_DIR/tex_base.jpg, tex_mr.jpg, tex_normal.jpg (raw images + the patches). Patch discs were found with a UV-coverage
raster of the raw (largest free discs @4096: (1082,1450) r101 and (1732,2928) r86, x / y-from-top) — see the note
docs/notes/hires-raw-rig-2026-10-22.md.  Colours: median of the raw's own texels (skin = fingers, cloth = wrist wrap)."""
import sys, io, json, struct
import numpy as np
from PIL import Image, ImageDraw
raw, out = sys.argv[1:3]
b = open(raw, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); o = 20 + L + 8
def img(i):
    bv = j['bufferViews'][j['images'][i]['bufferView']]; s = o + bv.get('byteOffset', 0)
    return Image.open(io.BytesIO(b[s:s + bv['byteLength']])).convert('RGB')
base, mr, nrm = img(0), img(1), img(2)       # raw order: baseColor, metallicRoughness, normal
PATCH = {   # name: (cx, cy_from_top, paint_radius @4096, base rgb, mr rgb)
    'glove': (1082, 1450, 93, (35, 38, 39), (255, 125, 3)),
    'skin':  (1732, 2928, 78, (217, 166, 145), (255, 163, 0)),
}
for im, kind in ((base, 'b'), (mr, 'm'), (nrm, 'n')):
    sc = im.size[0] / 4096.0; d = ImageDraw.Draw(im)
    for name, (cx, cy, r, cb, cm) in PATCH.items():
        col = cb if kind == 'b' else cm if kind == 'm' else (127, 126, 254)
        d.ellipse([(cx - r) * sc, (cy - r) * sc, (cx + r) * sc, (cy + r) * sc], fill=col)
for im, nm in ((base, 'tex_base.jpg'), (mr, 'tex_mr.jpg'), (nrm, 'tex_normal.jpg')):
    im.save(f'{out}/{nm}', quality=95, subsampling=0)
print('painted', list(PATCH), '->', out)
