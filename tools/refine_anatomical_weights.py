"""Re-run only weight preparation from the saved original import, not current weights."""
import bpy, numpy as np
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'out/anatomical-rig'
rig=bpy.data.objects['Ninja_ExportRig']
mesh=bpy.data.objects['Ninja_CurrentBody']
positions=np.load(OUT/'original-positions.npy')
baseline=np.load(OUT/'original-weights.npz')
weights=baseline['weights'].copy()
original_groups=baseline['names'].tolist()
text=(ROOT/'tools/prepare_anatomical_rig.py').read_text()
section=text[text.index('# Local edge smoothing'):text.index('# Validate standard linear')]
exec(compile(section,str(ROOT/'tools/prepare_anatomical_rig.py'),'exec'))
print('Refined shoulder attachment and continuous wrist cuff transition', changed_regions)
