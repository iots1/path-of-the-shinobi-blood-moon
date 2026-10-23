import numpy as np, scipy.sparse as sp
from scipy.sparse.csgraph import dijkstra, connected_components
for side in ('Right','Left'):
    D=np.load(f'hand_{side}.npz'); P,E=D['P'],D['E']; head=D['head']; a=D['a']; co=D['co']
    n=len(P); L=np.linalg.norm(P[E[:,0]]-P[E[:,1]],axis=1)
    G=sp.coo_matrix((np.r_[L,L],(np.r_[E[:,0],E[:,1]],np.r_[E[:,1],E[:,0]])),shape=(n,n)).tocsr()
    nc,lab=connected_components(G); big=np.bincount(lab).argmax(); print(side,'components',nc,'main',np.bincount(lab)[big],'of',n)
    t=(P-co)@a
    src=np.flatnonzero((t<0.004)&(lab==big))
    print(' source verts at the cut',len(src))
    dist=dijkstra(G,indices=src,min_only=True)
    dist[lab!=big]=-1
    # local maxima of geodesic distance (candidate tips): max within 2 cm geodesic neighbourhood... use vertex neighbourhood by Euclid radius
    from scipy.spatial import cKDTree
    kd=cKDTree(P); order=np.argsort(-dist); tips=[]
    for i in order[:4000]:
        if dist[i]<0.05: break
        if all(np.linalg.norm(P[i]-P[j])>0.025 for j in tips): tips.append(i)
        if len(tips)>=8: break
    print(' tips (geodesic dist, pos rel. wrist):')
    for i in tips: print('   d=%.3f'%dist[i], (P[i]-head).round(3), ' t=%.3f'%t[i])
    np.save(f'dist_{side}.npy',dist)
