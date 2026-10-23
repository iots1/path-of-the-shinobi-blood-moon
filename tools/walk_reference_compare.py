"""Walk definition-of-done: reference video frames vs. the game character at the same walk phase.

Reference: art/reference/new_ninja_katana/ninja_walk_katana.mp4 (24 fps, 10 s, side-on, facing right; 240 JPEG frames in art/reference/new_ninja_katana/walk_frames/,
made with an AVFoundation script — no ffmpeg on this machine). Measured from the silhouettes (dark boot pixels): the legs pass each other every ~20.8 frames
(step 0.87 s, stride ≈ 41.7 frames = 1.74 s, ~69 steps/min); heel strikes at ≈ f78, f99, f120 (best spread-curve match with the game, --hs 78), ...
Game: `await (await import('/debug/motion_check.js?'+Date.now())).walkRef({n:16, zoom:.95, fy:.87})` on a fresh load writes out/walkcmp-game-00..15.png
(560×720, level side camera, character height ≈ 89 % of the frame like the video); frame j = loco phase u0 + j/16 (u0 = .31 = left heel strike).

usage: python3 tools/walk_reference_compare.py [--hs 78] [--period 41.67] [--tag game]
writes out/walkcmp-sheet-A.png (phases 0-7) and -B.png (phases 8-15): row = reference | game, same stride phase."""
import sys, glob, os
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'art/reference/new_ninja_katana/walk_frames')
OUT = os.path.join(ROOT, 'out')
arg = lambda k, d: type(d)(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
HS, PERIOD, TAG, N = arg('--hs', 78.0), arg('--period', 41.67), arg('--tag', 'game'), 16
W, H = 560, 720

frames = sorted(glob.glob(REF + '/frame_*.jpg'))
def head_x(img):
    g = np.asarray(img.convert('L'), dtype=np.float32)
    m = g < 26                                   # black clothes only (the blade / floor are lighter)
    ys, xs = np.nonzero(m[:690])
    top = ys.min(); sel = np.nonzero(m[top:top + 40])[1]
    return float(sel.mean()) if len(sel) else 640.0

def ref_crop(fno):
    i = int(round(fno)) - 1
    im = Image.open(frames[i]).convert('RGB')
    cx = int(head_x(im)) - 20                    # the sword/arm sticks out to the left, keep a bit more room there
    x0 = max(0, min(1280 - W, cx - W // 2))
    return im.crop((x0, 0, x0 + W, H))

def font(d, xy, s, c=(255, 70, 70)): d.text(xy, s, fill=c)

for part, rng in (('A', range(0, 8)), ('B', range(8, 16))):
    sh = Image.new('RGB', (4 * 2 * W, 2 * H), (40, 40, 40)); d = ImageDraw.Draw(sh)
    for k, j in enumerate(rng):
        fno = HS + j * PERIOD / N
        r = ref_crop(fno)
        gp = os.path.join(OUT, f'walkcmp-{TAG}-{j:02d}.png')
        if not os.path.exists(gp): print('missing', gp); continue
        g = Image.open(gp).convert('RGB').resize((W, H))
        x, y = (k % 4) * 2 * W, (k // 4) * H
        sh.paste(r, (x, y)); sh.paste(g, (x + W, y))
        font(d, (x + 8, y + 6), f'phase {j}/16  ref f{int(round(fno))}'); font(d, (x + W + 8, y + 6), f'game u={(.31 + j / N) % 1:.2f}', (255, 200, 60))
        d.line([(x + W, y), (x + W, y + H)], fill=(255, 255, 255), width=2)
    sh = sh.resize((sh.width // 2, sh.height // 2), Image.LANCZOS)
    p = os.path.join(OUT, f'walkcmp-sheet-{part}.png'); sh.save(p); print('wrote', p, sh.size)
