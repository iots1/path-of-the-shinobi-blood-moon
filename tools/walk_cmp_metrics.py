"""Numbers for tools/walk_reference_compare.py: boot spread (max x-extent of the boots in the bottom band / body height) and foot lift (height difference of the two boots' lowest rows /
body height) per stride phase, reference video vs game frames out/walkcmp-game-NN.png. usage: python3 tools/walk_cmp_metrics.py [--hs 78] [--period 41.67]"""
import sys, os, glob
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = sorted(glob.glob(ROOT + '/art/reference/new_ninja_katana/walk_frames/frame_*.jpg'))
arg = lambda k, d: type(d)(sys.argv[sys.argv.index(k) + 1]) if k in sys.argv else d
HS, PERIOD = arg('--hs', 78.0), arg('--period', 41.67)
bref = lambda i: np.asarray(Image.open(REF[i]).convert('L'), dtype=np.float32) < 26
bgame = lambda j: np.asarray(Image.open(f'{ROOT}/out/walkcmp-game-{j:02d}.png').convert('L'), dtype=np.float32) < 150
def spread(m):
    cols = np.nonzero(m[560:700].sum(0) > 3)[0]; return (cols.max() - cols.min()) / 644.0
def lift(m, y0=600, y1=715):   # boots only (the lowered blade tip would otherwise count)
    band = m[y0:y1]; cols = np.nonzero(band.sum(0) > 3)[0]; xc = (cols.min() + cols.max()) / 2; res = []
    for sel in (cols[cols < xc], cols[cols >= xc]):
        r = np.nonzero(m[y0:y1][:, sel].sum(1) > 2)[0]; res.append(y0 + r.max() if len(r) else 0)
    return abs(res[0] - res[1]) / 644.0
R, G = [], []
print('phase  ref(spread,lift)  game(spread,lift)')
for j in range(16):
    mr, mg = bref(int(round(HS + j * PERIOD / 16)) - 1), bgame(j)
    R.append((spread(mr), lift(mr))); G.append((spread(mg), lift(mg)))
    print(f'{j:2d}     {R[-1][0]:.3f} {R[-1][1]:.3f}      {G[-1][0]:.3f} {G[-1][1]:.3f}')
R, G = np.array(R), np.array(G)
print('max spread ref %.3f game %.3f | mean |diff| spread %.3f | max lift ref %.3f game %.3f' % (R[:, 0].max(), G[:, 0].max(), np.abs(R[:, 0] - G[:, 0]).mean(), R[:, 1].max(), G[:, 1].max()))
