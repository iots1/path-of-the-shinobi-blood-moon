# Raw-hand finger fitting scripts (2026-10-22) — see docs/notes/hires-raw-rig-2026-10-22.md
Run order (system `python3`, numpy+scipy+PIL in the user site; paths at the top are scratchpad paths — adjust):
1. Blender (`execute_blender_code`): weld the raw hand region (verts with |x| > 0.5 beyond the wrist plane) → `hand_<Right|Left>.npz` {P (welded verts), E (edges), head (Hand bone head), a (forearm axis)}; bones of the rig → `bones_<side>.json`.
2. `tips.py` → geodesic distance from the wrist cut (`dist_<side>.npy`, tip candidates).
3. `topview.py` → calibrated underside image (the fingers: index y≈-36 mm, middle -11, ring +12, pinky +29; the pinky is short) — READ THIS FIRST, it is what identified the four fingers.
4. `slabs.py` → per-finger tracks by y-slab (`slabtracks_<side>.json`); `thumb.py` → thumb track; `build_thumb.py` → thumb chain anchored at the rig's CMC.
5. `build_chain3.py` (= build_chain2 with K 0.9) → `chains_<side>.json`; then centre every joint inside its finger (≤3 mm from the tracked line, maximise the depth below the surface) — see `rig_raw_hands.py`'s caller in the note; result `chains3_<side>.json`.
6. Blender: `tools/rig_raw_hands.py` (`apply(DIR)`) moves the bones of `RR_Armature2` and rewrites the hand-family weights of `RR_Raw`; dump the mesh (`raw_dump.npz` + `raw_names.json`), then `tools/graft_mesh2.py ORIG DIR RAW.glb OUT` and `add_outline_normals.py`.
`slices.py`, `center_chain.py`, `uv_free.py`, `sample_colors.py` are earlier/side experiments kept for reference (the slice/PCA finger split failed because the pinky is much shorter than the others and the fingers hang almost vertically).
