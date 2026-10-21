import sys
from PIL import Image, ImageDraw
# usage: sheet.py out.png mode prefixA [prefixB ...]  (rows = prefixes, cols = views)
out, mode, *pre = sys.argv[1:]
views=['front','side','q3','low']
S=400
im=Image.new('RGB',(S*len(views),S*len(pre)),'white')
d=ImageDraw.Draw(im)
for r,p in enumerate(pre):
    for c,v in enumerate(views):
        t=Image.open(f'{p}_{mode}_{v}.png').convert('RGB').resize((S,S))
        im.paste(t,(c*S,r*S)); d.text((c*S+6,r*S+6),f'{p.split("/")[-1]} {v}',fill=(255,0,0))
im.save(out)
