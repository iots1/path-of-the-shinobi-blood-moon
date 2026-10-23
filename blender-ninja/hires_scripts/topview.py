import numpy as np, sys
from PIL import Image, ImageDraw
side=sys.argv[1]; sg=-1 if side=='Right' else 1
D=np.load(f'hand_{side}.npz'); P=D['P']; head=D['head']; R=P-head
S=8  # px per mm
x0,x1=0.00,0.18; y0,y1=-0.07,0.07
W=int((x1-x0)*1000*S); H=int((y1-y0)*1000*S)
img=np.zeros((H,W,3),np.uint8)+30
xo=sg*R[:,0]; y=R[:,1]; z=R[:,2]
m=(xo>x0)&(xo<x1)&(y>y0)&(y<y1)
order=np.argsort(z[m])[::-1]   # draw high z first, low z (lower = palm side seen from below) last
idx=np.flatnonzero(m)[order]
zz=np.clip((z[idx]+0.10)/0.12,0,1)
for i,t in zip(idx,zz):
    px=int((xo[i]-x0)*1000*S); py=int((y[i]-y0)*1000*S)
    c=(int(40+215*t),int(60+120*(1-abs(t-0.5)*2)),int(255*(1-t)))
    img[max(py-1,0):py+2,max(px-1,0):px+2]=c
im=Image.fromarray(img); d=ImageDraw.Draw(im)
for xm in range(0,181,10):
    X=int(xm*S); d.line([(X,0),(X,H)],fill=(90,90,90)); d.text((X+2,2),str(xm),fill=(255,255,0))
for ym in range(-70,71,10):
    Y=int((ym-y0*1000)*S); d.line([(0,Y),(W,Y)],fill=(90,90,90)); d.text((2,Y+2),str(ym),fill=(0,255,255))
im.save(f'topview_{side}.png'); print(im.size)
